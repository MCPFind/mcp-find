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

// Main sync function - paginate through registry
export async function syncFromRegistry(supabase: SupabaseClient<any, any, any>): Promise<number> { // eslint-disable-line @typescript-eslint/no-explicit-any
  let cursor: string | undefined;
  let totalSynced = 0;

  do {
    const url = new URL(`${REGISTRY_API_BASE}${REGISTRY_SERVERS_ENDPOINT}`);
    url.searchParams.set('limit', String(REGISTRY_PAGE_SIZE));
    if (cursor) url.searchParams.set('cursor', cursor);

    const response = await fetch(url.toString());
    if (!response.ok) throw new Error(`Registry API error: ${response.status}`);

    const data = await response.json();
    const servers = data.servers || data.items || [];
    cursor = data.nextCursor || data.cursor;

    const records = [];
    for (const server of servers) {
      // Fix 8: Guard against missing id and name
      if (!server.id && !server.name) {
        console.warn('Skipping server with no id or name');
        continue;
      }

      // Extract package info from the packages array
      const pkg = server.packages?.[0];
      const packageName = pkg?.name || null;
      const packageType = detectPackageType(pkg);
      const packageUrl = pkg?.registry_url || null;

      // Extract capabilities
      const capabilities = server.capabilities || {};

      // Extract GitHub URL from source or packages
      const githubUrl = extractGithubUrl(server);

      const record = {
        id: server.id || server.name,
        slug: generateSlug(server.name || server.id),
        name: server.name || server.id,
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
        registry_status: server._meta?.status || 'active',
        registry_published_at: server._meta?.publishedAt || null,
        registry_updated_at: server._meta?.updatedAt || null,
        registry_tags: server._meta?.tags || [],
        last_synced_at: new Date().toISOString(),
      };

      records.push(record);
    }

    // Fix 1: Batch upsert all records for this page at once
    if (records.length > 0) {
      const { error } = await supabase.from('servers').upsert(records, { onConflict: 'id' });
      if (error) console.error(`Batch upsert failed:`, error.message);
      else totalSynced += records.length;
    }

    console.log(`Synced batch: ${servers.length} servers (total: ${totalSynced})`);
  } while (cursor);

  return totalSynced;
}

function detectPackageType(pkg: any): string | null {
  if (!pkg) return null;
  if (pkg.registry_url?.includes('npmjs.com') || pkg.name?.startsWith('@')) return 'npm';
  if (pkg.registry_url?.includes('pypi.org')) return 'pypi';
  if (pkg.registry_url?.includes('docker') || pkg.name?.includes('/')) return 'docker';
  return 'other';
}

function extractGithubUrl(server: any): string | null {
  // Check source field
  if (server.source?.url?.includes('github.com')) return server.source.url;
  // Check repository field
  if (server.repository?.url?.includes('github.com')) return server.repository.url;
  // Check packages for GitHub URLs
  for (const pkg of server.packages || []) {
    if (pkg.source_url?.includes('github.com')) return pkg.source_url;
    if (pkg.repository?.includes('github.com')) return pkg.repository;
  }
  return null;
}
