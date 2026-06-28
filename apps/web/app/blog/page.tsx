import { getAllPosts } from "@/lib/blog";
import { generateBlogIndexJsonLd } from "@/lib/blog-jsonld";
import { safeJsonLd } from "@/lib/json-ld";
import { SITE_URL } from "@mcpfind/shared";
import { Navbar } from "@/components/ui/navbar";
import { PostCard } from "@/components/blog/post-card";
import { BlogCategoryFilter } from "@/components/blog/blog-category-filter";
import { IconArrowLeft } from "@tabler/icons-react";
import Link from "next/link";
import type { Metadata } from "next";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Blog",
  description:
    "Guides, tutorials, and analysis on MCP servers and the Model Context Protocol. Learn how to connect AI assistants to your tools and data.",
  alternates: {
    canonical: `${SITE_URL}/blog`,
    types: {
      "application/rss+xml": "/blog/feed.xml",
    },
  },
  openGraph: {
    title: "Blog | MCP Find",
    description:
      "Guides, tutorials, and analysis on MCP servers and the Model Context Protocol.",
    type: "website",
    url: `${SITE_URL}/blog`,
    images: [
      {
        url: `${SITE_URL}/og-image-mcp.png`,
        width: 1200,
        height: 630,
        alt: "MCP Find — The open-source way to find MCP servers",
      },
    ],
  },
};

export default async function BlogIndexPage({
  searchParams,
}: {
  searchParams: Promise<{ category?: string }>;
}) {
  const params = await searchParams;
  const activeCategory = params.category || null;

  // Fetch all posts to derive category counts
  const allPosts = getAllPosts();

  // Derive categories sorted by count
  const categoryCounts = new Map<string, number>();
  allPosts.forEach((p) => {
    const cat = p.frontmatter.category;
    if (cat) categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
  });
  const categories = Array.from(categoryCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count);

  // Filter by active category
  const posts = activeCategory
    ? allPosts.filter((p) => p.frontmatter.category === activeCategory)
    : allPosts;

  return (
    <div className="min-h-screen bg-black text-white overflow-x-hidden">
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd(generateBlogIndexJsonLd()),
        }}
      />

      <Navbar variant="sticky" />

      {/* Hero */}
      <div className="border-b border-neutral-900 bg-neutral-950/50 pt-28">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-neutral-500 mb-8">
            <Link
              href="/"
              className="hover:text-white flex items-center gap-1.5 transition-colors duration-200"
            >
              <IconArrowLeft size={14} />
              Home
            </Link>
            <span>/</span>
            <span className="text-neutral-300">Blog</span>
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4">
            <span className="bg-gradient-to-r from-white via-blue-100 to-blue-400 bg-clip-text text-transparent">
              Blog
            </span>
          </h1>
          <p className="text-neutral-400 text-lg max-w-2xl leading-relaxed">
            Guides, tutorials, and analysis on MCP servers and the Model Context
            Protocol. Learn how to connect AI assistants to your tools and data.
          </p>
          {allPosts.length > 0 && (
            <p className="text-neutral-500 text-sm mt-4">
              {posts.length} {posts.length === 1 ? "article" : "articles"}
              {activeCategory && ` in ${activeCategory}`}
            </p>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Mobile: horizontal filter row */}
        <div className="sm:hidden mb-6">
          <BlogCategoryFilter
            categories={categories}
            activeCategory={activeCategory}
            totalCount={allPosts.length}
          />
        </div>

        <div className="flex gap-8">
          {/* Desktop: sidebar */}
          <aside className="shrink-0 w-48 hidden sm:block">
            <h3 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-3">
              Categories
            </h3>
            <BlogCategoryFilter
              categories={categories}
              activeCategory={activeCategory}
              totalCount={allPosts.length}
            />
          </aside>

          {/* Posts grid */}
          <main className="flex-1 min-w-0">
            {posts.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {posts.map((post) => (
                  <PostCard key={post.slug} post={post} />
                ))}
              </div>
            ) : (
              <div className="text-center py-20">
                <p className="text-neutral-500 text-lg">
                  {activeCategory
                    ? "No articles in this category."
                    : "No articles published yet. Check back soon!"}
                </p>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
