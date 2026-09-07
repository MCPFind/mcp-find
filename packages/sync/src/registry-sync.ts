import { SupabaseClient } from '@supabase/supabase-js';
import { REGISTRY_API_BASE, REGISTRY_SERVERS_ENDPOINT, REGISTRY_PAGE_SIZE, OFFICIAL_SCOPES } from '@mcpfind/shared';

// Function to generate URL-friendly slug from name
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
}

// Detect if server is from official scope
function isOfficial(packageName: string | null): boolean {
  if (!packageName) return false;
  return OFFICIAL_SCOPES.some(scope => packageName.startsWith(scope));
}

// Actual API response shape from registry.modelcontextprotocol.io/v0.1/servers
interface RegistryItem {
  server: {
    name?: string;
    title?: string;
    description?: string;
    version?: string;
    websiteUrl?: string;
    repository?: { url?: string };
    packages?: RegistryPackage[];
    remotes?: { type?: string; url?: string }[];
    capabilities?: Record<string, unknown>;
  };
  _meta: {
    'io.modelcontextprotocol.registry/official'?: {
      status?: string;
      publishedAt?: string;
      updatedAt?: string;
      tags?: string[];
    };
  };
}

// Registry v0.1 `Package` shape. The field names below are the ones the live
// API at registry.modelcontextprotocol.io/v0.1/servers actually emits —
// `identifier` and `registryType`, NOT the snake_case `name`/`registry_url`
// this file read until 2026-09. Reading the wrong names left package_name
// NULL on every row and pushed package_type onto a name-heuristic fallback
// that garbage-populated ~13k rows. Both are inputs to isIndexable(), so the
// whole catalogue lost a quality signal.
//
// The legacy snake_case names are kept as optional fallbacks so a mixed or
// rolled-back upstream response still parses; they are read only when the
// v0.1 name is absent.
interface RegistryPackage {
  /** v0.1: package identifier, e.g. "@acme/mcp-server" or "acme-mcp". */
  identifier?: string;
  /** v0.1: one of npm | pypi | oci | nuget | mcpb. */
  registryType?: string;
  /** v0.1: base URL of the package registry. */
  registryBaseUrl?: string;
  version?: string;

  // Legacy / defensive fallbacks — not emitted by v0.1.
  name?: string;
  registry_url?: string;
  source_url?: string;
  repository?: string;
}

/** Package identifier, preferring the v0.1 field over the legacy one. */
function packageIdentifier(pkg: RegistryPackage | null): string | null {
  if (!pkg) return null;
  return pkg.identifier || pkg.name || null;
}

/** Package registry base URL, preferring the v0.1 field over the legacy one. */
function packageRegistryUrl(pkg: RegistryPackage | null): string | null {
  if (!pkg) return null;
  return pkg.registryBaseUrl || pkg.registry_url || null;
}

export interface RegistrySyncOptions {
  /**
   * Called after every batch with the running total of rows written so far.
   *
   * The return value alone is not enough: it only exists if this function
   * runs to completion. When registry pagination throws partway through — a
   * 5xx on page N, the likely shape of the 2026-09-05 failure — the caller
   * has no number at all, and sync_log records servers_synced: 0 for a run
   * that wrote thousands of rows. This callback is how a partial run stays
   * legible.
   */
  onProgress?: (totalSynced: number) => void;
}

// Main sync function - paginate through registry
export async function syncFromRegistry(
  supabase: SupabaseClient<any, any, any>, // eslint-disable-line @typescript-eslint/no-explicit-any
  options: RegistrySyncOptions = {}
): Promise<number> {
  let cursor: string | undefined;
  let totalSynced = 0;

  do {
    const url = new URL(`${REGISTRY_API_BASE}${REGISTRY_SERVERS_ENDPOINT}`);
    url.searchParams.set('limit', String(REGISTRY_PAGE_SIZE));
    if (cursor) url.searchParams.set('cursor', cursor);

    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`Registry API error: ${response.status}`);

    const data = await response.json();
    // v0.1 API: items are { server, _meta } objects; pagination is under data.metadata.nextCursor
    const items: RegistryItem[] = data.servers || data.items || [];
    cursor = data.metadata?.nextCursor || data.nextCursor || data.cursor;

    const records = [];
    for (const item of items) {
      const server = item.server;
      const officialMeta = item._meta?.['io.modelcontextprotocol.registry/official'];

      // name is the unique identifier in v0.1 (e.g. "agency.lona/trading")
      if (!server.name) {
        console.warn('Skipping server with no name');
        continue;
      }

      // Extract package info from the packages array (may not exist in v0.1)
      const pkg = server.packages?.[0] || null;
      const packageName = packageIdentifier(pkg);
      const packageType = detectPackageType(pkg);
      const packageUrl = packageRegistryUrl(pkg);

      // Extract capabilities
      const capabilities = server.capabilities || {};

      // Extract GitHub URL from repository or packages
      const githubUrl = extractGithubUrl(server);

      const record = {
        id: server.name,
        slug: generateSlug(server.name),
        // canonical_slug is intentionally EXCLUDED from this record.
        // It is set once per server via a post-upsert backfill (see below) and
        // never touched again — guaranteeing URL stability even if upstream renames a server.
        name: server.title || server.name,
        description: server.description || null,
        version: server.version || pkg?.version || null,
        source: 'registry' as const,
        package_name: packageName,
        package_type: packageType,
        package_url: packageUrl,
        has_tools: Boolean(capabilities.tools),
        has_resources: Boolean(capabilities.resources),
        has_prompts: Boolean(capabilities.prompts),
        tool_count: Array.isArray(capabilities.tools) ? capabilities.tools.length : 0,
        github_url: githubUrl,
        is_official: isOfficial(packageName),
        registry_status: (() => {
          const s = officialMeta?.status;
          const valid = ['active', 'deprecated'] as const;
          type ValidStatus = typeof valid[number];
          const isValid = (v: string | undefined): v is ValidStatus => valid.includes(v as ValidStatus);
          if (s && !isValid(s)) {
            console.warn(`Unrecognized registry status "${s}" for server ${server.name}, defaulting to "active"`);
          }
          return isValid(s) ? s : 'active';
        })(),
        registry_published_at: officialMeta?.publishedAt || null,
        registry_updated_at: officialMeta?.updatedAt || null,
        registry_tags: officialMeta?.tags || [],
        last_synced_at: new Date().toISOString(),
      };

      records.push(record);
    }

    // Deduplicate within batch — keep last occurrence of each id
    const deduped = Object.values(
      records.reduce((acc, r) => { acc[r.id] = r; return acc; }, {} as Record<string, typeof records[0]>)
    );

    if (deduped.length > 0) {
      // canonical_slug is NOT in the upsert payload — it is never touched here.
      // Invariant: once a server has a canonical_slug it is immutable.
      // New rows will have canonical_slug = NULL after this upsert; the backfill
      // below sets it from slug immediately after all batches complete.
      const { error } = await supabase.from('servers').upsert(deduped, { onConflict: 'id' });
      if (error) console.error(`Batch upsert failed:`, error.message);
      else totalSynced += deduped.length;
    }

    options.onProgress?.(totalSynced);

    console.log(`Synced batch: ${items.length} servers (total: ${totalSynced})`);
  } while (cursor);

  // Backfill canonical_slug for any row that doesn't have one yet (new inserts from this
  // sync run, or rows that existed before migration 005 ran).
  // Invariant: rows that already have a canonical_slug are never touched.
  const { error: backfillError } = await supabase.rpc('backfill_canonical_slug');
  if (backfillError) {
    // Non-fatal: the column may not exist yet (pre-migration environment).
    // The next sync after migration 005 is applied will complete the backfill.
    console.warn('canonical_slug backfill skipped (migration may not be applied yet):', backfillError.message);
  }

  return totalSynced;
}

/**
 * Maps a registry package to our `package_type` enum.
 *
 * Order of authority:
 *   1. v0.1 `registryType` — the field the registry actually declares.
 *   2. The registry base URL, for legacy/rolled-back responses that carry a
 *      URL but no registryType.
 *   3. 'other' — a package exists, we just can't classify it.
 *
 * The old NAME-heuristic tier is deliberately gone. It classified anything
 * containing a "/" as 'docker' and anything starting with "@" as 'npm',
 * which is how ~13k rows acquired a package_type that describes nothing.
 * package_type feeds isIndexable(); inventing one is worse than null.
 */
function detectPackageType(pkg: RegistryPackage | null): 'npm' | 'pypi' | 'docker' | 'other' | null {
  if (!pkg) return null;

  // 1. Declared registry type (v0.1).
  switch (pkg.registryType?.toLowerCase()) {
    case 'npm': return 'npm';
    case 'pypi': return 'pypi';
    case 'oci': return 'docker';
    case 'nuget':
    case 'mcpb': return 'other';
  }

  // 2. Registry base URL, when no type is declared.
  const url = packageRegistryUrl(pkg) || '';
  if (url.includes('npmjs.com') || url.includes('npm')) return 'npm';
  if (url.includes('pypi.org')) return 'pypi';
  if (url.includes('docker') || url.includes('ghcr.io') || url.includes('gcr.io')) return 'docker';

  // 3. A package is present but unclassifiable. No name guessing.
  return 'other';
}

function extractGithubUrl(server: { repository?: { url?: string }; packages?: RegistryPackage[] }): string | null {
  // Check repository field
  if (server.repository?.url?.includes('github.com')) return server.repository.url;
  // Check packages for GitHub URLs
  for (const pkg of server.packages || []) {
    if (pkg.source_url?.includes('github.com')) return pkg.source_url;
    if (pkg.repository?.includes('github.com')) return pkg.repository;
  }
  return null;
}
