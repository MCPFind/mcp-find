// Two-layer caching:
// - React cache(): deduplicates within a single request/render
// - unstable_cache(): persists across requests with tag-based on-demand revalidation
import { cache } from 'react';
import { unstable_cache } from 'next/cache';
import { supabase } from './supabase';
import type { Server, ServerListItem, ServerWithTools, ServerListParams, ServerListResponse } from '@mcpfind/shared';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@mcpfind/shared';
import { isIndexable, readmeLengthOf, type IndexableServerInput } from './indexable';
import { maxLastmod } from './sitemap-lastmod';
import { normalizeListParams } from './filter-utils';

// All sequential detail reads share one deadline; leave room for rendering under 15s.
const QUERY_TIMEOUT_MS = 6000;
const DETAIL_QUERY_SLOW_MS = 1000;

type DetailQueryStage = 'canonical' | 'slug_fallback' | 'tools';
type ObservedQueryResult = { error?: { code?: string; message?: string } | null };

/**
 * Records only operational metadata. Deliberately excludes the requested slug,
 * query URL, response data and upstream error message so logs cannot capture
 * credentials, README content, or identifiers from request paths.
 */
async function observeDetailQuery<T extends ObservedQueryResult>(
  stage: DetailQueryStage,
  signal: AbortSignal,
  query: PromiseLike<T>
): Promise<T> {
  const startedAt = performance.now();
  try {
    const result = await query;
    const durationMs = Math.round(performance.now() - startedAt);
    if (result.error) {
      console.error('[queries] server detail query failed', {
        event: 'server_detail_query_error',
        stage,
        duration_ms: durationMs,
        error_code: result.error.code ?? 'unknown',
        aborted: signal.aborted,
      });
    } else if (durationMs >= DETAIL_QUERY_SLOW_MS) {
      console.warn('[queries] server detail query slow', {
        event: 'server_detail_query_slow',
        stage,
        duration_ms: durationMs,
      });
    }
    return result;
  } catch (error) {
    const durationMs = Math.round(performance.now() - startedAt);
    console.error('[queries] server detail query failed', {
      event: 'server_detail_query_error',
      stage,
      duration_ms: durationMs,
      error_code: error instanceof Error ? error.name : 'unknown',
      aborted: signal.aborted,
    });
    throw error;
  }
}

function assertAvailable(error: { message?: string } | null | undefined): void {
  if (error) throw new Error('Directory temporarily unavailable');
}

// Excludes readme_content and search_vector to avoid pulling large blobs in list queries.
// canonical_slug is included so route generation (sitemap, links) can use the stable URL column.
const SERVER_LIST_COLUMNS = 'id,slug,canonical_slug,name,description,version,category,source,package_name,package_type,package_url,has_tools,has_resources,has_prompts,tool_count,github_url,github_stars,github_forks,github_open_issues,github_last_push,github_license,github_language,github_contributors,github_archived,npm_weekly_downloads,registry_status,registry_published_at,registry_updated_at,registry_tags,is_official,featured,created_at,updated_at,last_synced_at';

// Detail-page column set: everything in SERVER_LIST_COLUMNS plus readme_content
// (rendered by ReadmeSection). Deliberately excludes search_vector — the one
// `servers` column no consumer of getServerBySlug (page JSX, metadata.ts,
// isIndexable, or the /api/servers/[slug] route) ever reads. select('*') was
// pulling it on every detail-page fetch for nothing.
const SERVER_DETAIL_COLUMNS = `${SERVER_LIST_COLUMNS},readme_content`;

// Applies the WHERE-clause filters shared between the paginated listing
// query below and the count-only query in _getFilteredCount — kept as one
// literal filter block per function (small duplication, no generic/`any`
// query-builder typing) so the two can never silently drift on which rows
// count as "matching."
async function _listServers(params: ServerListParams): Promise<ServerListResponse> {
  const page = Math.max(1, params.page || 1);
  const limit = Math.min(MAX_PAGE_SIZE, Math.max(1, params.limit || DEFAULT_PAGE_SIZE));
  const offset = (page - 1) * limit;
  const sort = params.sort || 'stars';
  const status = params.status || 'active';

  // T2 fix (2026-08-25): count:'exact' used to run unconditionally on this
  // select, forcing Postgres to materialize every matching row (COUNT(*)
  // OVER()) on EVERY paginated request regardless of page — confirmed via a
  // local EXPLAIN ANALYZE showing a full Seq Scan touching all matching rows
  // for the count alone (see supabase/migrations/008_status_stars_index.sql
  // and the T2 evidence in the task-store notes). The count is now sourced
  // from getFilteredCount() below instead: a SEPARATELY unstable_cache'd
  // call keyed by the filter combo (not the page), so the expensive count
  // query runs once per filter combo per cache window instead of once per
  // page request.
  let query = supabase
    .from('servers')
    .select(SERVER_LIST_COLUMNS)
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

  // Six-second abort timeout — prevents a hung/slow Supabase upstream from holding
  // the render open until the platform's function-duration ceiling.
  query = query.range(offset, offset + limit - 1).abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS));

  const [{ data, error }, total] = await Promise.all([
    query,
    getFilteredCount(params),
  ]);
  if (error) throw new Error(`Query failed: ${error.message}`);

  return {
    servers: (data || []) as ServerListItem[],
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

// Count-only query for the same filter combo _listServers applies above —
// deliberately a SEPARATE unstable_cache entry keyed on the filter portion
// of ServerListParams only (no page/limit/sort), so a crawler walking every
// page of one filter combo pays the count('exact') cost once per cache
// window instead of once per page. head:true skips returning row data
// entirely — only the count is fetched.
async function _getFilteredCount(params: ServerListParams): Promise<number> {
  const status = params.status || 'active';

  let query = supabase
    .from('servers')
    .select('*', { count: 'exact', head: true })
    .eq('registry_status', status);

  if (params.q) {
    query = query.textSearch('search_vector', params.q, { type: 'websearch' });
  }
  if (params.category) {
    query = query.eq('category', params.category);
  }
  if (params.packageTypes?.length) {
    query = query.in('package_type', params.packageTypes);
  }
  if (params.languages?.length) {
    query = query.in('github_language', params.languages);
  }
  if (params.hasTools) query = query.eq('has_tools', true);
  if (params.hasResources) query = query.eq('has_resources', true);
  if (params.hasPrompts) query = query.eq('has_prompts', true);
  if (params.isOfficial) query = query.eq('is_official', true);
  if (params.featured) query = query.eq('featured', true);

  query = query.abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS));

  const { count, error } = await query;
  if (error) throw new Error(`Count query failed: ${error.message}`);
  return count || 0;
}

const getFilteredCount = cache(
  async (params: ServerListParams): Promise<number> => {
    // Page/limit/sort intentionally excluded — the count is identical
    // across every page and every sort order of the same filter combo.
    const countCacheKey = [
      params.category ?? '',
      params.q ?? '',
      (params.packageTypes ?? []).join(','),
      (params.languages ?? []).join(','),
      params.hasTools ? '1' : '',
      params.hasResources ? '1' : '',
      params.hasPrompts ? '1' : '',
      params.isOfficial ? '1' : '',
      params.featured ? '1' : '',
      params.status ?? '',
    ].join('\x00');
    return unstable_cache(
      () => _getFilteredCount(params),
      ['filtered-count-v2', countCacheKey],
      { tags: ['servers', 'servers-listing'], revalidate: 21600 }
    )();
  }
);

export const listServers = cache(
  async (params: ServerListParams): Promise<ServerListResponse> => {
    const normalized = normalizeListParams(params);
    return unstable_cache(
      () => _listServers(normalized),
      ['list-servers-v2', JSON.stringify(normalized)],
      { tags: ['servers', 'servers-listing'], revalidate: 21600 }
    )();
  }
);

// Inner function — does the actual Supabase fetch.
// Resolves by canonical_slug first (stable URL column), then falls back to slug
// so this is safe to deploy before migration 005_canonical_slug.sql is applied.
async function _getServerBySlug(slug: string): Promise<ServerWithTools | null> {
  const signal = AbortSignal.timeout(QUERY_TIMEOUT_MS);
  // Try canonical_slug first (populated after migration 005 runs).
  // If no match, fall back to the mutable slug column (pre-migration or community servers).
  // The same signal covers all lookups, including the legacy fallback.
  let { data: server, error } = await observeDetailQuery(
    'canonical',
    signal,
    supabase
      .from('servers')
      .select(SERVER_DETAIL_COLUMNS)
      .eq('canonical_slug', slug)
      .abortSignal(signal)
      .maybeSingle()
  );

  assertAvailable(error);
  if (!server) {
    // Defensive fallback: resolve by the mutable slug column.
    // This path is hit before migration 005 is applied, or for rows where
    // canonical_slug has not yet been backfilled.
    const result = await observeDetailQuery(
      'slug_fallback',
      signal,
      supabase
        .from('servers')
        .select(SERVER_DETAIL_COLUMNS)
        .eq('slug', slug)
        .abortSignal(signal)
        .maybeSingle()
    );
    server = result.data;
    error = result.error;
  }

  assertAvailable(error);
  if (!server) return null;

  // Skip the tools fetch when authoritative row fields prove it cannot return
  // anything. The exact comparisons are deliberate: legacy/unknown states
  // still query server_tools and therefore cannot hide tool documentation.
  if (
    server.registry_status === 'deprecated' ||
    (server.has_tools === false && server.tool_count === 0)
  ) {
    return { ...server, tools: [] } as ServerWithTools;
  }

  const { data: tools, error: toolsError } = await observeDetailQuery(
    'tools',
    signal,
    supabase
      .from('server_tools')
      .select('*')
      .eq('server_id', server.id)
      .abortSignal(signal)
  );

  assertAvailable(toolsError);
  return { ...server, tools: tools || [] } as ServerWithTools;
}

// React cache() deduplicates within a single request; unstable_cache persists
// across requests and supports tag-based on-demand revalidation.
export const getServerBySlug = cache(
  async (slug: string): Promise<ServerWithTools | null> => {
    return unstable_cache(
      () => _getServerBySlug(slug),
      ['server-by-slug-v2', slug],
      { tags: ['servers', `server-${slug}`], revalidate: 604800 }
    )();
  }
);

export const getServerCount = cache(
  (): Promise<number> =>
    unstable_cache(
      async () => {
        const { count, error } = await supabase
          .from('servers')
          .select('*', { count: 'exact', head: true })
          .eq('registry_status', 'active')
          .abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS));
        assertAvailable(error);
        return count || 0;
      },
      ['server-count-v2'],
      { tags: ['servers', 'servers-listing'], revalidate: 21600 }
    )()
);

export const getTopServers = cache(
  (limit: number): Promise<ServerListItem[]> =>
    unstable_cache(
      async () => {
        const { data, error } = await supabase
          .from('servers')
          .select(SERVER_LIST_COLUMNS)
          .eq('registry_status', 'active')
          .order('github_stars', { ascending: false })
          .limit(Math.min(1000, Math.max(1, limit)))
          .abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS));
        assertAvailable(error);
        return (data || []) as ServerListItem[];
      },
      ['top-servers-v2', String(limit)],
      { tags: ['servers', 'servers-listing'], revalidate: 21600 }
    )()
);

// ---------------------------------------------------------------------------
// isIndexable() signal scans — README length, not README body
// ---------------------------------------------------------------------------
//
// Every scan below evaluates isIndexable() over the whole `servers` table.
// The predicate's README signal used to require readme_content, so all four
// scans SELECTed the full README body across the table purely to compute
// `trim(...).length >= 400`. With READMEs NULL on ~97.8% of rows that is
// ~7 MB per request; a repaired enrichment backfill (~21k rows, ~12 KB mean)
// turns it into ~250 MB per request on force-dynamic sitemap routes. That is
// why the enrichment repair was blocked behind this.
//
// Migration 010 adds `servers.readme_length`, a GENERATED ALWAYS ... STORED
// column holding exactly `length(btrim(readme_content))`, so the same
// decision costs 4 bytes per row and never detoasts the README.
//
// The migration is deliberately NOT a deploy-order dependency: the first
// window of each scan tries the lean column set, and if Postgres reports the
// column does not exist yet, this module falls back to the old readme_content
// set for the rest of the process and derives readme_length in JS. Same
// eligible set either way — only the byte cost differs.

interface SelectResult {
  data: unknown[] | null;
  error?: { code?: string; message?: string } | null;
}

/** null = not probed yet; false = migration 010 not applied on this database. */
let _readmeLengthColumnAvailable: boolean | null = null;

/** Test seam — resets the per-process probe. */
export function __resetReadmeLengthProbe(): void {
  _readmeLengthColumnAvailable = null;
}

function isMissingReadmeLengthColumn(error: SelectResult['error']): boolean {
  if (!error) return false;
  // PostgREST surfaces an unknown column as Postgres 42703 (undefined_column).
  // The message check is a fallback for clients that drop the code.
  return error.code === '42703' && (error.message ?? '').includes('readme_length');
}

/** A row shape carrying either the length column or the legacy body column. */
type ReadmeSignalRow = { readme_length?: number | null; readme_content?: string | null };

/**
 * Runs one window of a signal scan, preferring the lean (readme_length)
 * column set and degrading to the legacy (readme_content) set exactly once
 * per process if migration 010 has not been applied yet.
 *
 * Returns rows already normalised so `readme_length` is populated on both
 * paths — isIndexable() never sees the difference.
 */
async function selectIndexableSignalWindow<T extends ReadmeSignalRow>(
  run: (columns: string) => PromiseLike<SelectResult>,
  columns: { lean: string; legacy: string }
): Promise<T[] | null> {
  if (_readmeLengthColumnAvailable !== false) {
    const { data, error } = await run(columns.lean);
    if (!isMissingReadmeLengthColumn(error)) {
      assertAvailable(error);
      _readmeLengthColumnAvailable = true;
      return data as T[] | null;
    }
    _readmeLengthColumnAvailable = false;
    console.warn(
      '[queries] servers.readme_length is missing — migration 010 is not applied. ' +
        'Falling back to selecting readme_content, which is correct but transfers ' +
        'README bodies on every indexable scan.'
    );
  }

  const { data, error } = await run(columns.legacy);
  assertAvailable(error);
  if (!data) return null;
  return (data as T[]).map(row => ({
    ...row,
    readme_length: readmeLengthOf(row.readme_content ?? null),
  }));
}

// Columns needed for both list display (ServerListItem) and the isIndexable()
// signal check — SERVER_LIST_COLUMNS plus the README signal. `lean` names the
// generated readme_length column (4 bytes/row); `legacy` is the pre-migration
// fallback that pulls the body and measures it in JS.
const INDEXABLE_LIST_COLUMNS = {
  lean: `${SERVER_LIST_COLUMNS},readme_length`,
  legacy: `${SERVER_LIST_COLUMNS},readme_content`,
};

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
        const signal = AbortSignal.timeout(QUERY_TIMEOUT_MS);
        const SUPABASE_MAX = 1000;
        const results: ServerListItem[] = [];
        for (let offset = 0; results.length < limit; offset += SUPABASE_MAX) {
          const data = await selectIndexableSignalWindow<IndexableListRow>(
            columns =>
              supabase
                .from('servers')
                .select(columns)
                .eq('registry_status', 'active')
                // Necessary documentation condition only; isIndexable stays authoritative.
                .or('readme_content.not.is.null,tool_count.gt.0')
                .order('github_stars', { ascending: false })
                .order('id', { ascending: true })
                .range(offset, offset + SUPABASE_MAX - 1)
                .abortSignal(signal),
            INDEXABLE_LIST_COLUMNS
          );
          if (!data || data.length === 0) break;
          for (const row of data) {
            if (isIndexable(row)) {
              results.push(row as ServerListItem);
              if (results.length >= limit) break;
            }
          }
          if (data.length < SUPABASE_MAX) break;
        }
        return results.slice(0, limit);
      },
      ['indexable-top-servers-v2', String(limit)],
      { tags: ['servers', 'servers-listing'], revalidate: 21600 }
    )()
);

// Columns needed to evaluate isIndexable() in addition to the sitemap's own
// slug/canonical_slug/updated_at fields.
//
// The README signal is read as readme_length, never readme_content. This scan
// covers the ENTIRE servers table on a force-dynamic route; selecting the body
// here was the single largest transfer in the app and the reason the GitHub
// enrichment backfill could not be turned back on.
const SITEMAP_SIGNAL_COLUMNS = {
  lean: 'slug,canonical_slug,updated_at,registry_updated_at,registry_status,github_archived,readme_length,has_tools,tool_count,package_name,package_type,github_stars,category',
  legacy:
    'slug,canonical_slug,updated_at,registry_updated_at,registry_status,github_archived,readme_content,has_tools,tool_count,package_name,package_type,github_stars,category',
};

type SitemapRow = Pick<
  ServerListItem,
  'slug' | 'canonical_slug' | 'updated_at' | 'registry_updated_at'
> &
  IndexableServerInput;

/**
 * What the sitemap emitters consume. `lastmod` is already resolved here —
 * GREATEST(updated_at, registry_updated_at) — so no downstream file has to
 * decide what a server page's real modification date is, and none of them
 * can quietly substitute `now()`.
 *
 * `registry_updated_at` is a genuine upstream change stamp (it drives the
 * name, description and version the page renders), and it moves independently
 * of our own `updated_at`. Ignoring it, as this query did until 2026-09, made
 * every page look frozen at the last successful enrichment run even when the
 * registry had since republished it.
 *
 * `lastmod` is null when the row carries no usable timestamp at all. That is
 * a real answer, and the emitters render it by omitting <lastmod> rather than
 * inventing a date.
 */
export interface SitemapUrlRow {
  slug: string;
  canonical_slug: string | null;
  lastmod: string | null;
}

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
  (): Promise<SitemapUrlRow[]> =>
    unstable_cache(
      async () => {
        const signal = AbortSignal.timeout(QUERY_TIMEOUT_MS);
        const SUPABASE_MAX = 1000;
        const results: SitemapUrlRow[] = [];
        for (let offset = 0; ; offset += SUPABASE_MAX) {
          const data = await selectIndexableSignalWindow<SitemapRow>(
            columns =>
              supabase
                .from('servers')
                .select(columns)
                .eq('registry_status', 'active')
                // Necessary documentation condition only; isIndexable stays authoritative.
                .or('readme_content.not.is.null,tool_count.gt.0')
                .order('github_stars', { ascending: false })
                .order('id', { ascending: true })
                .range(offset, offset + SUPABASE_MAX - 1)
                .abortSignal(signal),
            SITEMAP_SIGNAL_COLUMNS
          );
          if (!data || data.length === 0) break;
          for (const row of data) {
            if (isIndexable(row)) {
              results.push({
                slug: row.slug,
                canonical_slug: row.canonical_slug,
                lastmod: maxLastmod([row.updated_at, row.registry_updated_at]),
              });
            }
          }
          if (data.length < SUPABASE_MAX) break;
        }
        return results;
      },
      ['indexable-sitemap-rows-v2'],
      { tags: ['servers'], revalidate: 3600 }
    )()
);

/**
 * The most recent real modification date across every indexable server.
 *
 * Used as the honest lastmod for pages that aggregate the catalogue (`/`,
 * `/servers`) and for the shard entries in sitemap.xml. Reads the same
 * already-cached list the shards slice from, so it adds no query and cannot
 * drift from the shard bodies — which is exactly how the index came to claim
 * `today` while the shard it pointed at said 2026-03-25.
 *
 * Null when there are no indexable servers: omit <lastmod>.
 */
export const getIndexableSitemapMaxLastmod = cache(
  async (): Promise<string | null> =>
    maxLastmod((await _getIndexableSitemapRows()).map(r => r.lastmod))
);

/**
 * Max real lastmod within one shard's slice — the value sitemap.xml must
 * advertise for that shard. Derived from the shard's own contents, so the
 * index and the shard body can never disagree.
 */
export const getSitemapShardLastmod = cache(
  async (offset: number, pageSize: number): Promise<string | null> => {
    const rows = await getServersSitemapPage(offset, pageSize);
    return maxLastmod(rows.map(r => r.lastmod));
  }
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
  async (offset: number, pageSize: number): Promise<SitemapUrlRow[]> => {
    const rows = await _getIndexableSitemapRows();
    return rows.slice(offset, offset + pageSize);
  }
);

// Columns needed to evaluate isIndexable() for the generateStaticParams gate,
// plus canonical_slug/slug for the static param itself. README signal read as
// a length, never as a body — see selectIndexableSignalWindow above.
const INDEXABLE_SLUG_COLUMNS = {
  lean: 'slug,canonical_slug,registry_status,github_archived,readme_length,has_tools,tool_count,package_name,package_type,github_stars,category',
  legacy:
    'slug,canonical_slug,registry_status,github_archived,readme_content,has_tools,tool_count,package_name,package_type,github_stars,category',
};

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
        const signal = AbortSignal.timeout(QUERY_TIMEOUT_MS);
        const SUPABASE_MAX = 1000;
        const allRows: IndexableSlugRow[] = [];
        const results: string[] = [];
        for (let offset = 0; results.length < limit; offset += SUPABASE_MAX) {
          const data = await selectIndexableSignalWindow<IndexableSlugRow>(
            columns =>
              supabase
                .from('servers')
                .select(columns)
                .eq('registry_status', 'active')
                // Necessary documentation condition only; isIndexable stays authoritative.
                .or('readme_content.not.is.null,tool_count.gt.0')
                .order('github_stars', { ascending: false })
                .order('id', { ascending: true })
                .range(offset, offset + SUPABASE_MAX - 1)
                .abortSignal(signal),
            INDEXABLE_SLUG_COLUMNS
          );
          if (!data || data.length === 0) break;
          allRows.push(...data);
          for (const row of data) {
            if (isIndexable(row)) {
              results.push(row.canonical_slug ?? row.slug);
              if (results.length >= limit) break;
            }
          }
          if (data.length < SUPABASE_MAX) break;
        }
        return results.slice(0, limit);
      },
      ['indexable-server-slugs-v2', String(limit)],
      { tags: ['servers'], revalidate: 3600 }
    )()
);

// React cache() for request-level dedup; unstable_cache for cross-request persistence with tags.
export const getServersByCategory = cache(
  (category: string): Promise<ServerListItem[]> =>
    unstable_cache(
      async () => {
        const { data, error } = await supabase
          .from('servers')
          .select(SERVER_LIST_COLUMNS)
          .eq('category', category)
          .eq('registry_status', 'active')
          .order('github_stars', { ascending: false })
          .limit(200)
          .abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS));
        assertAvailable(error);
        return (data || []) as ServerListItem[];
      },
      ['servers-by-category-v2', category],
      { tags: ['servers', 'servers-listing', `category-${category}`], revalidate: 21600 }
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
        const signal = AbortSignal.timeout(QUERY_TIMEOUT_MS);
        const SUPABASE_MAX = 1000;
        const results: ServerListItem[] = [];
        for (let offset = 0; ; offset += SUPABASE_MAX) {
          const data = await selectIndexableSignalWindow<IndexableListRow>(
            columns =>
              supabase
                .from('servers')
                .select(columns)
                .eq('category', category)
                .eq('registry_status', 'active')
                // Necessary documentation condition only; isIndexable stays authoritative.
                .or('readme_content.not.is.null,tool_count.gt.0')
                .order('github_stars', { ascending: false })
                .order('id', { ascending: true })
                .range(offset, offset + SUPABASE_MAX - 1)
                .abortSignal(signal),
            INDEXABLE_LIST_COLUMNS
          );
          if (!data || data.length === 0) break;
          for (const row of data) {
            if (isIndexable(row)) {
              results.push(row as ServerListItem);
            }
          }
          if (data.length < SUPABASE_MAX) break;
        }
        return results;
      },
      ['indexable-servers-by-category-v2', category],
      { tags: ['servers', 'servers-listing', `category-${category}`], revalidate: 21600 }
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
        const { count, error } = await supabase
          .from('servers')
          .select('*', { count: 'exact', head: true })
          .eq('category', category)
          .eq('registry_status', 'active')
          .abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS));
        assertAvailable(error);
        return count || 0;
      },
      ['category-count-v2', category],
      { tags: ['servers', 'servers-listing', `category-${category}`], revalidate: 21600 }
    )()
);

export const getCategoryLastUpdated = cache(
  (): Promise<Record<string, string>> =>
    unstable_cache(
      async () => {
        // registry_updated_at is read alongside updated_at for the same reason
        // the sitemap rows read it: it is a real upstream change stamp for
        // fields the category listing renders, and it moves independently.
        // The per-category value is the max of both across the rows we see.
        //
        // NOTE: PostgREST caps this select at its default page size, so this
        // is the max over the most-recently-updated rows, not a whole-table
        // MAX(). Every value returned is still a real timestamp belonging to
        // a real row in that category — it can under-report, never invent.
        const { data, error } = await supabase
          .from('servers')
          .select('category, updated_at, registry_updated_at')
          .eq('registry_status', 'active')
          .order('updated_at', { ascending: false })
          .abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS));

        assertAvailable(error);
        const result: Record<string, string> = {};
        for (const row of data || []) {
          if (!row.category) continue;
          const rowLastmod = maxLastmod([row.updated_at, row.registry_updated_at]);
          if (!rowLastmod) continue;
          const best = maxLastmod([result[row.category], rowLastmod]);
          if (best) result[row.category] = best;
        }
        return result;
      },
      ['category-last-updated-v2'],
      { tags: ['servers', 'servers-listing'], revalidate: 21600 }
    )()
);

export const getLastSyncTime = cache(
  (): Promise<string | null> =>
    unstable_cache(
      async () => {
        const { data, error } = await supabase
          .from('sync_log')
          .select('completed_at')
          .eq('status', 'completed')
          .order('completed_at', { ascending: false })
          .limit(1)
          .abortSignal(AbortSignal.timeout(QUERY_TIMEOUT_MS))
          .maybeSingle();
        assertAvailable(error);
        return data?.completed_at || null;
      },
      ['last-sync-time-v2'],
      { tags: ['servers', 'servers-listing'], revalidate: 21600 }
    )()
);
