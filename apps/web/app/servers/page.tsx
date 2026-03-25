import { listServers } from '@/lib/queries';
import { CATEGORIES, SITE_NAME } from '@mcpfind/shared';
import type { Category } from '@mcpfind/shared';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: `Browse MCP Servers | ${SITE_NAME}`,
  description:
    'Search and filter 2000+ MCP servers. Get instant install configs for Claude Desktop, Cursor, VS Code, Windsurf, and Claude Code.',
};

export default async function ServersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; category?: string; sort?: string; page?: string }>;
}) {
  const params = await searchParams;

  const SORT_ALLOWLIST = ['stars', 'updated', 'name', 'downloads'] as const;
  type SortOption = typeof SORT_ALLOWLIST[number];

  const rawCategory = params.category;
  const validCategory: Category | undefined = rawCategory && (CATEGORIES as readonly string[]).includes(rawCategory)
    ? rawCategory as Category
    : undefined;

  const rawSort = params.sort;
  const validSort: SortOption = rawSort && (SORT_ALLOWLIST as readonly string[]).includes(rawSort)
    ? rawSort as SortOption
    : 'stars';

  const result = await listServers({
    q: params.q,
    category: validCategory,
    sort: validSort,
    page: params.page ? parseInt(params.page, 10) : 1,
  });

  return (
    <main className="min-h-screen p-8">
      {/* TODO: Adam — SearchBar component (client component, debounced, updates URL params) */}
      {/* TODO: Adam — CategoryFilter component (sidebar, client component) */}
      {/* TODO: Adam — Sort dropdown */}
      <h1 className="text-3xl font-bold mb-8">Browse MCP Servers</h1>
      <p className="text-gray-600 mb-4">{result.total} servers found</p>

      {/* TODO: Adam — Replace with ServerCard grid (responsive: 1/2/3 cols) */}
      <div className="grid gap-4">
        {result.servers.map((server) => (
          <div key={server.id} className="border p-4 rounded">
            <Link href={`/servers/${server.slug}`} className="text-lg font-semibold hover:underline">
              {server.name}
            </Link>
            <p className="text-gray-600 text-sm mt-1">{server.description}</p>
            <div className="flex gap-4 mt-2 text-xs text-gray-500">
              <span>&#9733; {server.github_stars}</span>
              <span>{server.category}</span>
              <span>{server.github_license}</span>
            </div>
          </div>
        ))}
      </div>

      {/* TODO: Adam — Pagination component */}
      <div className="mt-8 text-sm text-gray-500">
        Page {result.page} of {result.totalPages}
      </div>
    </main>
  );
}

