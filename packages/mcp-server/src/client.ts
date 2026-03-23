import type { Server, ServerWithTools, ServerListResponse, ConfigOutput, ClientType, Category, SortOption } from '@mcpfind/shared';

const DEFAULT_API_URL = 'https://mcpfind.org/api';

function getApiUrl(): string {
  return process.env.MCPFIND_API_URL || DEFAULT_API_URL;
}

export async function searchServers(params: {
  query: string;
  category?: Category;
  sort_by?: SortOption;
  limit?: number;
}): Promise<Server[]> {
  const url = new URL(`${getApiUrl()}/servers`);
  url.searchParams.set('q', params.query);
  if (params.category !== undefined) url.searchParams.set('category', params.category);
  if (params.sort_by !== undefined) url.searchParams.set('sort', params.sort_by);
  if (params.limit !== undefined) url.searchParams.set('limit', String(params.limit));

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const data: ServerListResponse = await res.json();
  return data?.servers ?? [];
}

export async function getServerDetails(serverId: string): Promise<ServerWithTools | null> {
  const res = await fetch(`${getApiUrl()}/servers/${encodeURIComponent(serverId)}`, { signal: AbortSignal.timeout(10_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}

export async function getInstallConfig(serverId: string, client: ClientType): Promise<ConfigOutput | null> {
  const res = await fetch(`${getApiUrl()}/servers/${encodeURIComponent(serverId)}/config/${client}`, { signal: AbortSignal.timeout(10_000) });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json();
}
