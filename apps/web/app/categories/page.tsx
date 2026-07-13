/**
 * Categories index — /categories
 *
 * Crawlable hub-of-hubs: lists every category with a real <Link> to its hub
 * page (/categories/[category]). Indexing-recovery Slice 4 (internal
 * linking): this is the second hop on the home -> category hub -> server
 * path, and gives category hubs a stable, dedicated landing point distinct
 * from the homepage's "Browse by Category" filter cards (which link to
 * /servers?category=X, not the canonical hub URL). generateCategoryJsonLd's
 * BreadcrumbList on every category page already references
 * `${SITE_URL}/categories` as "Categories" — this page fills that
 * previously-dangling breadcrumb target.
 *
 * Server Component: fully SSR'd, no client JS required to read the list.
 */

import Link from "next/link";
import type { Metadata } from "next";
import { Navbar } from "@/components/ui/navbar";
import { safeJsonLd } from "@/lib/json-ld";
import { getIndexableServersByCategory } from "@/lib/queries";
import { CATEGORIES, CATEGORY_LABELS, CATEGORY_DESCRIPTIONS, SITE_URL, SITE_NAME } from "@mcpfind/shared";
import type { Category } from "@mcpfind/shared";
import { IconServer, IconArrowRight } from "@tabler/icons-react";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: `Browse MCP Server Categories | ${SITE_NAME}`,
  description:
    "Browse Model Context Protocol servers by category — databases, cloud, devtools, AI & ML, security, and more.",
  alternates: { canonical: `${SITE_URL}/categories` },
  openGraph: {
    title: `Browse MCP Server Categories | ${SITE_NAME}`,
    description:
      "Browse Model Context Protocol servers by category — databases, cloud, devtools, AI & ML, security, and more.",
    url: `${SITE_URL}/categories`,
    siteName: SITE_NAME,
    type: "website",
  },
};

export default async function CategoriesIndexPage() {
  // Gated (isIndexable()) count per category — degrades to 0 per-category
  // rather than failing the whole page if Supabase is unavailable (CI/build).
  const counts = await Promise.all(
    CATEGORIES.map(async (cat) => {
      try {
        const servers = await getIndexableServersByCategory(cat);
        return [cat, servers.length] as const;
      } catch {
        return [cat, 0] as const;
      }
    })
  );
  const countMap = new Map(counts);

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar variant="sticky" />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd({
            "@context": "https://schema.org",
            "@graph": [
              {
                "@type": "CollectionPage",
                "@id": `${SITE_URL}/categories`,
                name: "MCP Server Categories",
                url: `${SITE_URL}/categories`,
                description: "Browse Model Context Protocol servers by category.",
                breadcrumb: { "@id": `${SITE_URL}/categories#breadcrumb` },
                mainEntity: {
                  "@type": "ItemList",
                  numberOfItems: CATEGORIES.length,
                  itemListElement: CATEGORIES.map((cat, i) => ({
                    "@type": "ListItem",
                    position: i + 1,
                    url: `${SITE_URL}/categories/${cat}`,
                    name: CATEGORY_LABELS[cat as Category],
                  })),
                },
              },
              {
                "@type": "BreadcrumbList",
                "@id": `${SITE_URL}/categories#breadcrumb`,
                itemListElement: [
                  { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
                  { "@type": "ListItem", position: 2, name: "Categories", item: `${SITE_URL}/categories` },
                ],
              },
            ],
          }),
        }}
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 pb-12">
        <div className="mb-10">
          <h1 className="text-4xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-neutral-400 mb-2">
            Browse MCP Server Categories
          </h1>
          <p className="text-neutral-400 text-base max-w-2xl">
            Every MCP server in the directory, organized by category. Pick a
            category to see all servers that clear our quality bar.
          </p>
        </div>

        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 list-none p-0 m-0">
          {CATEGORIES.map((cat) => (
            <li key={cat} className="contents" role="listitem">
              <Link
                href={`/categories/${cat}`}
                className="group flex flex-col gap-2 p-5 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 hover:bg-neutral-800/80 transition-all duration-200"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-neutral-800 group-hover:bg-neutral-700 flex items-center justify-center transition-colors duration-200">
                      <IconServer size={16} className="text-neutral-400" />
                    </div>
                    <span className="font-semibold text-neutral-100 group-hover:text-white transition-colors duration-200">
                      {CATEGORY_LABELS[cat as Category]}
                    </span>
                  </div>
                  <IconArrowRight
                    size={16}
                    className="text-neutral-600 group-hover:text-neutral-400 transition-colors duration-200"
                  />
                </div>
                <p className="text-neutral-500 text-sm line-clamp-2">
                  {CATEGORY_DESCRIPTIONS[cat as Category]}
                </p>
                <span className="text-neutral-600 text-xs mt-1">
                  {countMap.get(cat) ?? 0} servers
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
