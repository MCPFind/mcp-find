// Two-layer caching:
// - React cache(): deduplicates within a single request/render
// - unstable_cache(): persists across requests with tag-based on-demand revalidation
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { supabase } from './supabase';
import type { Server, ServerListItem, ServerWithTools, ServerListParams, ServerListResponse } from '@mcpfind/shared';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@mcpfind/shared';
import { isIndexable, type IndexableServerInput } from './indexable';

// Excludes readme_content and search_vector to avoid pulling large blobs in list queries.
// canonical_slug is included so route generation (sitemap, links) can use the stable URL column.
const SERVER_LIST_COLUMNS = 'id,slug,canonical_slug,name,description,version,category,source,package_name,package_type,package_url,has_tools,has_resources,has_prompts,tool_count,github_url,github_stars,github_forks,github_open_issues,github_last_push,github_license,github_language,github_contributors,github_archived,npm_weekly_downloads,registry_status,registry_published_at,registry_updated_at,registry_tags,is_official,featured,created_at,updated_at,last_synced_at';

async function _listServers(params: ServerListParams): Promise<ServerListResponse> {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, params.limit || DEFAULT_PAGE_SIZE));
  const offset = (page - 1) * limit;
  const sort = params.sort || 'stars';
  const status = params.status || 'active';

  let query = supabase
    .from('servers')
    .select(SERVER_LIST_COLUMNS, { count: 'exact' })
    .eq('registry_status', status);

  // Full-text search
  if (params.q) {
    query = query.textSearch('search_vector', params.q, { type: 'websearch' });
  }

  // Category filter
  if (params.category) {
    query = query.eq('category', params.category);
  }

  // Package type filter (OR within group)
  if (params.packageTypes?.length) {
    query = query.in('package_type', params.packageTypes);
  }

  // Language filter (OR within group)
  if (params.languages?.length) {
    query = query.in('github_language', params.languages);
  }

  // Capability filters
  if (params.hasTools) query = query.eq('has_tools', true);
  if (params.hasResources) query = query.eq('has_resources', true);
  if (params.hasPrompts) query = query.eq('has_prompts', true);

  // Badge filters
  if (params.isOfficial) query = query.eq('is_official', true);
  if (params.featured) query = query.eq('featured', true);

  // Sort
  switch (sort) {
    case 'stars': query = query.order('github_stars', { ascending: false }); break;
    case 'updated': query = query.order('github_last_push', { ascending: false, nullsFirst: false }); break;
    case 'name': query = query.order('name', { ascending: true }); break;
    case 'downloads': query = query.order('npm_weekly_downloads', { ascending: false }); break;
  }

  // 8s abort timeout — prevents a hung/slow Supabase upstream from holding
  // the render open until the platform's function-duration ceiling.
  query = query.range(offset, offset + limit - 1).abortSignal(AbortSignal.timeout(8000));

  const { data, count, error } = await query;
  if (error) throw new Error(`Query failed: ${error.message}`);

  return {
    servers: (data || []) as ServerListItem[],
    total: count || 0,
    page,
    limit,
    totalPages: Math.ceil((count || 0) / limit),
  };
}

export const listServers = cache(
  async (params: ServerListParams): Promise<ServerListResponse> => {
    const cacheKey = [
      params.category ?? '',
      params.q ?? '',
      String(params.page ?? 1),
      String(params.limit ?? DEFAULT_PAGE_SIZE),
      params.sort ?? '',
      (params.packageTypes ?? []).join(','),
      (params.languages ?? []).join(','),
      params.hasTools ? '1' : '',
      params.hasResources ? '1' : '',
      params.hasPrompts ? '1' : '',
      params.isOfficial ? '1' : '',
      params.featured ? '1' : '',
    ].join('\x00');
    try {
      return await unstable_cache(
        () => _listServers(params),
        ['list-servers', cacheKey],
        { tags: ['servers'], revalidate: 3600 }
      )();
    } catch (err) {
      // Upstream failed or hit the 8s abort timeout — degrade to an empty
      // list instead of hanging/500ing the render. The try/catch sits
      // OUTSIDE unstable_cache, so only successful results ever get
      // persisted into the 1h cache; a bad upstream moment isn't cached.
      console.error('listServers: upstream failed, returning empty result', err);
      return {
        servers: [],
        total: 0,
        page: params.page || 1,
        limit: params.limit || DEFAULT_PAGE_SIZE,
        totalPages: 0,
      };
    }
  }
);

// Inner function — does the actual Supabase fetch.
// Resolves by canonical_slug first (stable URL column), then falls back to slug
// so this is safe to deploy before migration 005_canonical_slug.sql is applied.
async function _getServerBySlug(slug: string): Promise<ServerWithTools | null> {
  // Try canonical_slug first (populated after migration 005 runs).
  // If no match, fall back to the mutable slug column (pre-migration or community servers).
  // 8s abort timeout on every Supabase call below — same rationale as
  // _listServers: fail fast instead of hanging until the function's
  // maxDuration ceiling.
  let { data: server, error } = await supabase
    .from('servers')
    .select('*')
    .eq('canonical_slug', slug)
    .abortSignal(AbortSignal.timeout(8000))
    .maybeSingle();

  if (!server) {
    // Defensive fallback: resolve by the mutable slug column.
    // This path is hit before migration 005 is applied, or for rows where
    // canonical_slug has not yet been backfilled.
    const result = await supabase
      .from('servers')
      .select('*')
      .eq('slug', slug)
      .abortSignal(AbortSignal.timeout(8000))
      .maybeSingle();
    server = result.data;
    error = result.error;
  }

  if (error || !server) return null;

  // Skip the tools fetch for deprecated rows — the page will call notFound() immediately,
  // so the tools data is never used. Return early with an empty tools array.
  if (server.registry_status === 'deprecated') {
    return { ...server, tools: [] } as ServerWithTools;
  }

  const { data: tools } = await supabase
    .from('server_tools')
    .select('*')
    .eq('server_id', server.id)
    .abortSignal(AbortSignal.timeout(8000));

  return { ...server, tools: tools || [] } as ServerWithTools;
}

// React cache() deduplicates within a single request; unstable_cache persists
// across requests and supports tag-based on-demand revalidation.
export const getServerBySlug = cache(
  async (slug: string): Promise<ServerWithTools | null> => {
    try {
      return await unstable_cache(
        () => _getServerBySlug(slug),
        ['server-by-slug', slug],
        { tags: ['servers', `server-${slug}`], revalidate: 86400 }
      )();
    } catch (err) {
      // Upstream failed or hit the 8s abort timeout — fall through to null
      // so the page takes the existing notFound() path instead of
      // hanging/500ing. Not cached: this try/catch sits outside
      // unstable_cache, same reasoning as listServers above.
      console.error(`getServerBySlug(${slug}): upstream failed, returning null`, err);
      return null;
    }
  }
);

export const getServerCount = cache(
  (): Promise<number> =>
    unstable_cache(
      async () => {
        const { count } = await supabase
          .from('servers')
          .select('*', { count: 'exact', head: true })
          .eq('registry_status', 'active');
        return count || 0;
      },
      ['server-count'],
      { tags: ['servers'], revalidate: 3600 }
    )()
);

export const getTopServers = cache(
  (limit: number): Promise<ServerListItem[]> =>
    unstable_cache(
      async () => {
        const { data } = await supabase
          .from('servers')
          .select(SERVER_LIST_COLUMNS)
          .eq('registry_status', 'active')
          .order('github_stars', { ascending: false })
          .limit(limit);
        return (data || []) as ServerListItem[];
      },
      ['top-servers', String(limit)],
      { tags: ['servers'], revalidate: 3600 }
    )()
);

// Columns needed for both list display (ServerListItem) and the isIndexable()
// signal check — SERVER_LIST_COLUMNS plus readme_content (excluded from the
// list columns as a large blob, but required to evaluate signal 1).
const INDEXABLE_LIST_COLUMNS = `${SERVER_LIST_COLUMNS},readme_content`;

type IndexableListRow = ServerListItem & IndexableServerInput;

/**
 * Gated top-N servers by github_stars, filtered to isIndexable() — the
 * homepage "top servers" linking surface (Slice 4, internal linking). Unlike
 * getTopServers(), this never surfaces a thin/non-gated server as a link.
 *
 * Scans in SUPABASE_MAX-row windows (same pagination technique as
 * _getIndexableSitemapRows) so the star-ordered scan isn't truncated by
 * Supabase's 1,000-row cap before enough indexable rows are found.
 */
export const getIndexableTopServers = cache(
  (limit: number): Promise<ServerListItem[]> =>
    unstable_cache(
      async () => {
        const SUPABASE_MAX = 1000;
        const results: ServerListItem[] = [];
        for (let offset = 0; results.length < limit; offset += SUPABASE_MAX) {
          const { data } = await supabase
            .from('servers')
            .select(INDEXABLE_LIST_COLUMNS)
            .eq('registry_status', 'active')
            .order('github_stars', { ascending: false })
            .range(offset, offset + SUPABASE_MAX - 1);
          if (!data || data.length === 0) break;
          for (const row of data as IndexableListRow[]) {
            if (isIndexable(row)) {
              results.push(row as ServerListItem);
              if (results.length >= limit) break;
            }
          }
          if (data.length < SUPABASE_MAX) break;
        }
        return results.slice(0, limit);
      },
      ['indexable-top-servers', String(limit)],
      { tags: ['servers'], revalidate: 3600 }
    )()
);

// Columns needed to evaluate isIndexable() in addition to the sitemap's own
// slug/canonical_slug/updated_at fields. readme_content is the one signal not
// already in SERVER_LIST_COLUMNS (excluded there as a large blob) — safe to
// select here since this is scanned once per sitemap generation and this
// text is never returned in the XML response.
const SITEMAP_SIGNAL_COLUMNS =
  'slug,canonical_slug,updated_at,registry_status,github_archived,readme_content,has_tools,tool_count,package_name,package_type,github_stars,category';

type SitemapRow = Pick<ServerListItem, 'slug' | 'canonical_slug' | 'updated_at'> & IndexableServerInput;

// Fetches the FULL ordered (github_stars desc) list of indexable servers'
// sitemap fields, scanning the raw `servers` table past Supabase's 1,000-row
// cap the same way getIndexableServerSlugs does.
//
// This is the single source of truth the sitemap shards over: indexable
// servers cluster in the high-star head of the raw table, so filtering
// *inside* a raw-offset window (the old, buggy approach) leaves later
// shards empty. Filtering across the whole ordered table first, then
// slicing the ALREADY-FILTERED list per shard, guarantees every advertised
// shard is dense — see sitemap.xml/route.ts and sitemap-servers.ts.
const _getIndexableSitemapRows = cache(
  (): Promise<Pick<ServerListItem, 'slug' | 'canonical_slug' | 'updated_at'>[]> =>
    unstable_cache(
      async () => {
        const SUPABASE_MAX = 1000;
        const results: Pick<ServerListItem, 'slug' | 'canonical_slug' | 'updated_at'>[] = [];
        for (let offset = 0; ; offset += SUPABASE_MAX) {
          const { data } = await supabase
            .from('servers')
            .select(SITEMAP_SIGNAL_COLUMNS)
            .eq('registry_status', 'active')
            .order('github_stars', { ascending: false })
            .range(offset, offset + SUPABASE_MAX - 1);
          if (!data || data.length === 0) break;
          for (const row of data as SitemapRow[]) {
            if (isIndexable(row)) {
              results.push({
                slug: row.slug,
                canonical_slug: row.canonical_slug,
                updated_at: row.updated_at,
              });
            }
          }
          if (data.length < SUPABASE_MAX) break;
        }
        return results;
      },
      ['indexable-sitemap-rows'],
      { tags: ['servers'], revalidate: 3600 }
    )()
);

// Total count of indexable servers — drives how many shards sitemap.xml
// advertises. Derived from the same pre-filtered list the shards slice from,
// so the index and the shard contents can never drift apart.
export const getIndexableServerCount = cache(
  async (): Promise<number> => (await _getIndexableSitemapRows()).length
);

// Fetch a page of servers for sitemap generation, sliced from the
// pre-filtered, ordered INDEXABLE list (not the raw table) — offset/pageSize
// address positions within the indexable sequence, so every in-range shard
// is guaranteed non-empty and dense.
export const getServersSitemapPage = cache(
  async (offset: number, pageSize: number): Promise<Pick<ServerListItem, 'slug' | 'canonical_slug' | 'updated_at'>[]> => {
    const rows = await _getIndexableSitemapRows();
    return rows.slice(offset, offset + pageSize);
  }
);

// Columns needed to evaluate isIndexable() for the generateStaticParams gate,
// plus canonical_slug/slug for the static param itself.
const INDEXABLE_SLUG_COLUMNS =
  'slug,canonical_slug,registry_status,github_archived,readme_content,has_tools,tool_count,package_name,package_type,github_stars,category';

type IndexableSlugRow = { slug: string; canonical_slug: string | null } & IndexableServerInput;

/**
 * Returns the stable slug (canonical_slug ?? slug) for every isIndexable()
 * active server, ordered by github_stars desc, capped at `limit`.
 *
 * Used by generateStaticParams to pre-render the gated core instead of a
 * flat top-N — see apps/web/app/servers/[slug]/page.tsx. Paginates past
 * Supabase's 1,000-row cap the same way getServersSitemapPage does.
 */
export const getIndexableServerSlugs = cache(
  (limit: number): Promise<string[]> =>
    unstable_cache(
      async () => {
        const SUPABASE_MAX = 1000;
        const allRows: IndexableSlugRow[] = [];
        const results: string[] = [];
        for (let offset = 0; results.length < limit; offset += SUPABASE_MAX) {
          const { data } = await supabase
            .from('servers')
            .select(INDEXABLE_SLUG_COLUMNS)
            .eq('registry_status', 'active')
            .order('github_stars', { ascending: false })
            .range(offset, offset + SUPABASE_MAX - 1);
          if (!data || data.length === 0) break;
          allRows.push(...(data as IndexableSlugRow[]));
          for (const row of data as IndexableSlugRow[]) {
            if (isIndexable(row)) {
              results.push(row.canonical_slug ?? row.slug);
              if (results.length >= limit) break;
            }
          }
          if (data.length < SUPABASE_MAX) break;
        }
        return results.slice(0, limit);
      },
      ['indexable-server-slugs', String(limit)],
      { tags: ['servers'], revalidate: 3600 }
    )()
);

// React cache() for request-level dedup; unstable_cache for cross-request persistence with tags.
export const getServersByCategory = cache(
  (category: string): Promise<ServerListItem[]> =>
    unstable_cache(
      async () => {
        const { data } = await supabase
          .from('servers')
          .select(SERVER_LIST_COLUMNS)
          .eq('category', category)
          .eq('registry_status', 'active')
          .order('github_stars', { ascending: false })
          .limit(200);
        return (data || []) as ServerListItem[];
      },
      ['servers-by-category', category],
      { tags: ['servers', `category-${category}`], revalidate: 3600 }
    )()
);

/**
 * Gated (isIndexable()) servers for a category, ordered by github_stars
 * desc — the source of truth for category-hub internal linking (Slice 4).
 * Unlike getServersByCategory(), this never links a thin/non-gated server,
 * so it is safe to use for category hub pages and the related-servers block
 * without re-checking isIndexable() at the call site.
 *
 * Paginates past Supabase's 1,000-row cap the same way
 * _getIndexableSitemapRows/getIndexableServerSlugs do, so large categories
 * are fully scanned rather than silently truncated at the raw-row cap.
 */
export const getIndexableServersByCategory = cache(
  (category: string): Promise<ServerListItem[]> =>
    unstable_cache(
      async () => {
        const SUPABASE_MAX = 1000;
        const results: ServerListItem[] = [];
        for (let offset = 0; ; offset += SUPABASE_MAX) {
          const { data } = await supabase
            .from('servers')
            .select(INDEXABLE_LIST_COLUMNS)
            .eq('category', category)
            .eq('registry_status', 'active')
            .order('github_stars', { ascending: false })
            .range(offset, offset + SUPABASE_MAX - 1);
          if (!data || data.length === 0) break;
          for (const row of data as IndexableListRow[]) {
            if (isIndexable(row)) {
              results.push(row as ServerListItem);
            }
          }
          if (data.length < SUPABASE_MAX) break;
        }
        return results;
      },
      ['indexable-servers-by-category', category],
      { tags: ['servers', `category-${category}`], revalidate: 3600 }
    )()
);

/**
 * Returns the true count of active servers for a given category.
 * Used in JSON-LD numberOfItems to reflect the real category size,
 * not just the page-size cap from getServersByCategory().
 */
export const getCategoryCount = cache(
  (category: string): Promise<number> =>
    unstable_cache(
      async () => {
        const { count } = await supabase
          .from('servers')
          .select('*', { count: 'exact', head: true })
          .eq('category', category)
          .eq('registry_status', 'active');
        return count || 0;
      },
      ['category-count', category],
      { tags: ['servers', `category-${category}`], revalidate: 3600 }
    )()
);

export const getCategoryLastUpdated = cache(
  (): Promise<Record<string, string>> =>
    unstable_cache(
      async () => {
        const { data } = await supabase
          .from('servers')
          .select('category, updated_at')
          .eq('registry_status', 'active')
          .order('updated_at', { ascending: false });

        const result: Record<string, string> = {};
        for (const row of data || []) {
          if (row.category && !result[row.category]) {
            result[row.category] = row.updated_at;
          }
        }
        return result;
      },
      ['category-last-updated'],
      { tags: ['servers'], revalidate: 3600 }
    )()
);

export const getLastSyncTime = cache(
  (): Promise<string | null> =>
    unstable_cache(
      async () => {
        const { data } = await supabase
          .from('sync_log')
          .select('completed_at')
          .eq('status', 'completed')
          .order('completed_at', { ascending: false })
          .limit(1)
          .single();
        return data?.completed_at || null;
      },
      ['last-sync-time'],
      { tags: ['servers'], revalidate: 3600 }
    )()
);
