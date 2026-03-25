import { cache } from 'react';
import { supabase } from './supabase';
import type { Server, ServerListItem, ServerWithTools, ServerListParams, ServerListResponse } from '@mcpfind/shared';
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from '@mcpfind/shared';

// Excludes readme_content and search_vector to avoid pulling large blobs in list queries
const SERVER_LIST_COLUMNS = 'id,slug,name,description,version,category,source,package_name,package_type,package_url,has_tools,has_resources,has_prompts,tool_count,github_url,github_stars,github_forks,github_open_issues,github_last_push,github_license,github_language,github_contributors,github_archived,npm_weekly_downloads,registry_status,registry_published_at,registry_updated_at,registry_tags,is_official,featured,created_at,updated_at,last_synced_at';

export async function listServers(params: ServerListParams): Promise<ServerListResponse> {
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

  // Sort
  switch (sort) {
    case 'stars': query = query.order('github_stars', { ascending: false }); break;
    case 'updated': query = query.order('github_last_push', { ascending: false, nullsFirst: false }); break;
    case 'name': query = query.order('name', { ascending: true }); break;
    case 'downloads': query = query.order('npm_weekly_downloads', { ascending: false }); break;
  }

  query = query.range(offset, offset + limit - 1);

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

export const getServerBySlug = cache(async (slug: string): Promise<ServerWithTools | null> => {
  const { data: server, error } = await supabase
    .from('servers')
    .select('*')
    .eq('slug', slug)
    .single();

  if (error || !server) return null;

  const { data: tools } = await supabase
    .from('server_tools')
    .select('*')
    .eq('server_id', server.id);

  return { ...server, tools: tools || [] } as ServerWithTools;
});

export async function getServerCount(): Promise<number> {
  const { count } = await supabase
    .from('servers')
    .select('*', { count: 'exact', head: true })
    .eq('registry_status', 'active');
  return count || 0;
}

export async function getTopServers(limit: number): Promise<ServerListItem[]> {
  const { data } = await supabase
    .from('servers')
    .select(SERVER_LIST_COLUMNS)
    .eq('registry_status', 'active')
    .order('github_stars', { ascending: false })
    .limit(limit);
  return (data || []) as ServerListItem[];
}

export const getServersByCategory = cache(async (category: string): Promise<ServerListItem[]> => {
  const { data } = await supabase
    .from('servers')
    .select(SERVER_LIST_COLUMNS)
    .eq('category', category)
    .eq('registry_status', 'active')
    .order('github_stars', { ascending: false })
    .limit(200);
  return (data || []) as ServerListItem[];
});

export async function getLastSyncTime(): Promise<string | null> {
  const { data } = await supabase
    .from('sync_log')
    .select('completed_at')
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .single();
  return data?.completed_at || null;
}
