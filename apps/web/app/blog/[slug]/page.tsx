import { getPostBySlug, getPostSlugs, getRelatedPosts } from "@/lib/blog";
import { generateBlogPostJsonLd } from "@/lib/blog-jsonld";
import { safeJsonLd } from "@/lib/json-ld";
import { SITE_URL } from "@mcpfind/shared";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { compileMDX } from "next-mdx-remote/rsc";
import remarkGfm from "remark-gfm";
import rehypeSlug from "rehype-slug";
import { Navbar } from "@/components/ui/navbar";
import { PostHeader } from "@/components/blog/post-header";
import { PostFooter } from "@/components/blog/post-footer";
import { TableOfContents } from "@/components/blog/table-of-contents";
import type { TocHeading } from "@/components/blog/table-of-contents";
import { mdxComponents } from "@/components/blog/mdx-components";
import { BlogFaq } from "@/components/blog/blog-faq";

export const revalidate = 86400;

export function generateStaticParams() {
  return getPostSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) return { title: "Post Not Found" };

  return {
    title: `${post.frontmatter.title} | MCP Find Blog`,
    description: post.frontmatter.description,
    alternates: {
      canonical: `/blog/${post.slug}`,
    },
    openGraph: {
      title: post.frontmatter.title,
      description: post.frontmatter.description,
      type: "article",
      url: `/blog/${post.slug}`,
      publishedTime: post.frontmatter.date,
      modifiedTime: post.frontmatter.updatedAt || post.frontmatter.date,
      authors: [post.frontmatter.author],
      tags: post.frontmatter.tags,
      images: [
        {
          url: `${SITE_URL}/blog/${post.slug}/opengraph-image`,
          width: 1200,
          height: 630,
        },
      ],
    },
  };
}

function extractHeadings(content: string): TocHeading[] {
  const headingRegex = /^(#{2,3})\s+(.+)$/gm;
  const headings: TocHeading[] = [];
  let match: RegExpExecArray | null;
  while ((match = headingRegex.exec(content)) !== null) {
    const raw = match[2] ?? "";
    const text = raw
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[`*_]/g, "");
    headings.push({
      id: text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, ""),
      text,
      level: (match[1] ?? "##").length,
    });
  }
  return headings;
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  if (!post) notFound();

  const relatedPosts = getRelatedPosts(post, 3);
  const headings = extractHeadings(post.content);

  const { content } = await compileMDX({
    source: post.content,
    components: mdxComponents,
    options: {
      parseFrontmatter: false,
      mdxOptions: {
        remarkPlugins: [remarkGfm],
        rehypePlugins: [rehypeSlug],
      },
    },
  });

  return (
    <div className="min-h-screen bg-black text-white overflow-x-hidden">
      {/* JSON-LD */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: safeJsonLd(generateBlogPostJsonLd(post)),
        }}
      />

      <Navbar variant="sticky" />

      {/* Header */}
      <PostHeader post={post} />

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_250px] gap-10">
          {/* Article */}
          <article
            className={[
              "prose prose-invert prose-neutral max-w-none",
              "prose-headings:text-white prose-headings:font-bold prose-headings:tracking-tight",
              "prose-h1:text-2xl prose-h2:text-xl prose-h3:text-lg prose-h4:text-base",
              "prose-headings:border-b prose-headings:border-neutral-800 prose-headings:pb-2 prose-headings:mb-4",
              "prose-p:text-neutral-400 prose-p:leading-relaxed",
              "prose-a:text-blue-400 prose-a:no-underline hover:prose-a:text-blue-300 prose-a:transition-colors",
              "prose-strong:text-neutral-200 prose-strong:font-semibold",
              "prose-em:text-neutral-300",
              "prose-li:text-neutral-400 prose-ul:marker:text-neutral-600 prose-ol:marker:text-neutral-600",
              "prose-blockquote:border-l-neutral-700 prose-blockquote:text-neutral-400 prose-blockquote:not-italic",
              "prose-hr:border-neutral-800",
              "prose-table:border-collapse",
              "prose-thead:border-neutral-700",
              "prose-th:text-neutral-300 prose-th:bg-neutral-800/60 prose-th:border prose-th:border-neutral-700 prose-th:px-3 prose-th:py-2",
              "prose-td:text-neutral-400 prose-td:border prose-td:border-neutral-800 prose-td:px-3 prose-td:py-2",
              "prose-tr:border-neutral-800",
              "prose-code:text-blue-300 prose-code:bg-neutral-900 prose-code:rounded prose-code:px-1.5 prose-code:py-0.5",
              "prose-code:text-sm prose-code:font-mono prose-code:before:content-none prose-code:after:content-none",
              "prose-pre:p-0 prose-pre:bg-transparent prose-pre:rounded-none prose-pre:border-0 prose-pre:shadow-none",
            ].join(" ")}
          >
            {content}
          </article>

          {/* Sidebar */}
          <aside className="hidden lg:block">
            <TableOfContents headings={headings} />
          </aside>
        </div>

        {/* FAQ accordion — rendered from frontmatter, outside prose */}
        {post.frontmatter.faqItems && post.frontmatter.faqItems.length > 0 && (
          <div className="max-w-none lg:max-w-[calc(100%-250px-2.5rem)]">
            <BlogFaq faqItems={post.frontmatter.faqItems} />
          </div>
        )}

        {/* Related posts */}
        <PostFooter relatedPosts={relatedPosts} />
      </div>
    </div>
  );
}
