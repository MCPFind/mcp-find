import { Suspense } from "react";
import { listServers } from "@/lib/queries";
import { CATEGORIES, SITE_NAME, CATEGORY_LABELS, SITE_URL } from "@mcpfind/shared";
import type { Category } from "@mcpfind/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { Navbar } from "@/components/ui/navbar";
import { ServerCard } from "@/components/ui/server-card";
import { ServersFilters } from "@/components/ui/servers-filters";
import { IconFilter, IconArrowLeft, IconArrowRight } from "@tabler/icons-react";
import { parseFilterParams } from "@/lib/filter-utils";
import { safeJsonLd } from "@/lib/json-ld";

export const metadata: Metadata = {
  title: `Browse MCP Servers | ${SITE_NAME}`,
  description:
    "Search and filter 2000+ MCP servers. Get instant install configs for Claude Desktop, Cursor, VS Code, Windsurf, and Claude Code.",
  alternates: { canonical: `${SITE_URL}/servers` },
};

export default async function ServersPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    category?: string;
    sort?: string;
    page?: string;
    pkg?: string;
    lang?: string;
    tools?: string;
    resources?: string;
    prompts?: string;
    official?: string;
    featured?: string;
  }>;
}) {
  const params = await searchParams;
  const filters = parseFilterParams(params);

  let result: Awaited<ReturnType<typeof listServers>> = {
    servers: [],
    total: 0,
    page: 1,
    limit: 24,
    totalPages: 0,
  };

  try {
    result = await listServers({
      q: filters.q || undefined,
      category: (filters.category as Category) || undefined,
      packageTypes: filters.packageTypes.length ? filters.packageTypes : undefined,
      languages: filters.languages.length ? filters.languages : undefined,
      hasTools: filters.hasTools || undefined,
      hasResources: filters.hasResources || undefined,
      hasPrompts: filters.hasPrompts || undefined,
      isOfficial: filters.isOfficial || undefined,
      featured: filters.featured || undefined,
      sort: filters.sort,
      page: filters.page,
    });
  } catch {
    // Supabase not available (e.g., during build without credentials)
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar variant="sticky" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-12">
        {/* Page header */}
        <div className="mb-10">
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-neutral-400 mb-2">
            Verified MCP Server Directory
          </h1>
          <p className="text-neutral-500 text-lg">
            {result.total.toLocaleString()} verified servers available across{" "}
            {CATEGORIES.length} categories
            {filters.category && (
              <span>
                {" "}
                in{" "}
                <span className="text-blue-400">
                  {CATEGORY_LABELS[filters.category as Category]}
                </span>
              </span>
            )}
          </p>
        </div>

        <Suspense fallback={<ServersLoadingSkeleton />}>
          <ServersFilters
            initialFilters={filters}
            totalCount={result.total}
          >
            {/* Results */}
            <div>
              <div className="flex items-center justify-between mb-6">
                <p className="text-neutral-500 text-sm">
                  Showing{" "}
                  <span className="text-white font-semibold">
                    {result.servers.length}
                  </span>{" "}
                  of{" "}
                  <span className="text-white font-semibold">
                    {result.total.toLocaleString()}
                  </span>{" "}
                  server{result.total !== 1 ? "s" : ""}
                  {filters.q && (
                    <span>
                      {" "}
                      for &ldquo;
                      <span className="text-blue-400">{filters.q}</span>&rdquo;
                    </span>
                  )}
                </p>
              </div>

              {result.servers.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-neutral-900 border border-neutral-800 flex items-center justify-center mb-4">
                    <IconFilter size={28} className="text-neutral-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-neutral-300 mb-2">
                    No servers found
                  </h3>
                  <p className="text-neutral-500 text-sm max-w-xs">
                    Try adjusting your search or filters to find what
                    you&apos;re looking for.
                  </p>
                  <Link
                    href="/servers"
                    className="mt-4 text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors duration-200"
                  >
                    Clear all filters
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {result.servers.map((server) => (
                    <ServerCard key={server.id} server={server} />
                  ))}
                </div>
              )}

              {/* Pagination */}
              {result.totalPages > 1 && (
                <div className="flex items-center justify-between mt-10 pt-6 border-t border-neutral-900">
                  <div className="flex items-center gap-2">
                    {filters.page > 1 && (
                      <PaginationLink
                        href={buildPageUrl(params, filters.page - 1)}
                        icon={<IconArrowLeft size={16} />}
                        label="Previous"
                      />
                    )}
                  </div>
                  <span className="text-sm text-neutral-500">
                    Page{" "}
                    <span className="text-white font-semibold">
                      {filters.page}
                    </span>{" "}
                    of{" "}
                    <span className="text-white font-semibold">
                      {result.totalPages}
                    </span>
                  </span>
                  <div className="flex items-center gap-2">
                    {filters.page < result.totalPages && (
                      <PaginationLink
                        href={buildPageUrl(params, filters.page + 1)}
                        icon={<IconArrowRight size={16} />}
                        label="Next"
                        iconRight
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          </ServersFilters>
        </Suspense>
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "CollectionPage",
                "@id": `${SITE_URL}/servers`,
                name: "MCP Server Directory",
                url: `${SITE_URL}/servers`,
                description: "Browse 2000+ MCP servers with instant install configs for Claude Desktop, Cursor, VS Code, Windsurf, and Claude Code.",
                mainEntity: {
                  "@type": "ItemList",
                  numberOfItems: result.total,
                  itemListElement: result.servers.slice(0, 50).map((s, i) => ({
                    "@type": "ListItem",
                    position: i + 1,
                    url: `${SITE_URL}/servers/${s.slug}`,
                    name: s.name,
                  })),
                },
                breadcrumb: { "@id": `${SITE_URL}/servers#breadcrumb` },
              },
              {
                "@type": "BreadcrumbList",
                "@id": `${SITE_URL}/servers#breadcrumb`,
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
                  { "@type": "ListItem", position: 2, name: "MCP Server Directory", item: `${SITE_URL}/servers` },
                ],
              },
            ],
          }),
        }}
      />
    </div>
  );
}

function buildPageUrl(
  params: Record<string, string | undefined>,
  page: number
) {
  const p = new URLSearchParams();
  if (params.q) p.set("q", params.q);
  if (params.category) p.set("category", params.category);
  if (params.pkg) p.set("pkg", params.pkg);
  if (params.lang) p.set("lang", params.lang);
  if (params.tools) p.set("tools", params.tools);
  if (params.resources) p.set("resources", params.resources);
  if (params.prompts) p.set("prompts", params.prompts);
  if (params.official) p.set("official", params.official);
  if (params.featured) p.set("featured", params.featured);
  if (params.sort && params.sort !== "stars") p.set("sort", params.sort);
  if (page > 1) p.set("page", String(page));
  return `/servers${p.toString() ? `?${p.toString()}` : ""}`;
}

function PaginationLink({
  href,
  icon,
  label,
  iconRight,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  iconRight?: boolean;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-2 px-4 py-2 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-300 hover:text-white text-sm font-medium transition-colors duration-200"
    >
      {!iconRight && icon}
      {label}
      {iconRight && icon}
    </Link>
  );
}

function ServersLoadingSkeleton() {
  return (
    <div className="flex gap-8 animate-pulse">
      <div className="shrink-0 w-52 hidden sm:block">
        <div className="h-4 w-20 bg-neutral-800 rounded mb-4" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-8 bg-neutral-900 rounded-lg mb-1" />
        ))}
      </div>
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-48 bg-neutral-900 rounded-xl border border-neutral-800" />
        ))}
      </div>
    </div>
  );
}
