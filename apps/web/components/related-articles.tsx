import Link from "next/link";
import { getAllPosts } from "@/lib/blog";
import { IconBook, IconArrowRight } from "@tabler/icons-react";

interface RelatedArticlesProps {
  serverCategory: string | null | undefined;
  maxPosts?: number;
  serverName?: string;
  serverDescription?: string | null;
}

export async function RelatedArticles({
  serverCategory,
  maxPosts = 3,
  serverName = "",
  serverDescription = "",
}: RelatedArticlesProps) {
  const allPosts = getAllPosts();

  // Match posts where blog category equals server category OR tags include the server category
  const normalizedCategory = serverCategory?.toLowerCase().trim() ?? "";

  const matched = normalizedCategory
    ? allPosts.filter((post) => {
        const blogCategory = post.frontmatter.category?.toLowerCase().trim();
        const tags = post.frontmatter.tags.map((t) => t.toLowerCase().trim());
        return (
          blogCategory === normalizedCategory ||
          tags.includes(normalizedCategory)
        );
      })
    : [];

  // Prefer the actual task over a potentially stale broad category.
  const isCalendar = /\b(?:calendars?|gcal|ical|caldav)\b/i.test(`${serverName} ${serverDescription}`);
  const taskPosts = isCalendar
    ? allPosts.filter(p => /calendar/.test(`${p.slug} ${p.frontmatter.tags.join(" ")}`))
    : [];
  const posts = (taskPosts.length ? taskPosts : matched).slice(0, maxPosts);

  if (posts.length === 0) return null;

  return (
    <section className="mt-10">
      <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
        <IconBook size={20} className="text-blue-400" />
        Learn More
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {posts.map((post) => (
          <Link
            key={post.slug}
            href={`/blog/${post.slug}`}
            className="group flex flex-col gap-2 p-4 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-blue-800/50 hover:bg-neutral-800/60 transition-all duration-200"
          >
            <span className="text-white text-sm font-semibold group-hover:text-blue-300 transition-colors duration-200 line-clamp-2 leading-snug">
              {post.frontmatter.title}
            </span>
            {post.frontmatter.excerpt && (
              <span className="text-neutral-500 text-xs line-clamp-3 leading-relaxed flex-1">
                {post.frontmatter.excerpt}
              </span>
            )}
            <span className="flex items-center gap-1 text-blue-500 text-xs font-medium group-hover:text-blue-400 transition-colors duration-200 mt-auto">
              Read article
              <IconArrowRight size={12} />
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
