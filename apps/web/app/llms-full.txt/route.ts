import { NextResponse } from 'next/server';
import { getServerCount, getTopServers } from '@/lib/queries';
import { SITE_NAME, SITE_URL, CATEGORIES, CATEGORY_LABELS } from '@mcpfind/shared';
import { getAllPosts } from '@/lib/blog';

export const dynamic = 'force-dynamic';

export async function GET() {
  const count = await getServerCount();
  // Fetch all servers in one query, then group by category in code
  const allServers = await getTopServers(10000);
  const blogPosts = getAllPosts();

  const byCategory = new Map<string, typeof allServers>();
  for (const s of allServers) {
    const cat = s.category ?? 'other';
    const bucket = byCategory.get(cat) ?? [];
    bucket.push(s);
    byCategory.set(cat, bucket);
  }

  let content = `# ${SITE_NAME} — Full Server Index\n\n`;
  content += `> Complete index of ${count}+ MCP servers and ${blogPosts.length} blog posts. Updated daily.\n\n`;

  for (const category of CATEGORIES) {
    if (category === 'other') continue;
    const label = CATEGORY_LABELS[category];
    const servers = byCategory.get(category) ?? [];
    if (servers.length === 0) continue;

    content += `## ${label}\n\n`;
    for (const s of servers) {
      content += `### [${s.name}](${SITE_URL}/servers/${s.slug})\n`;
      content += `${s.description || 'No description.'}\n`;
      content += `- Stars: ${s.github_stars}\n- License: ${s.github_license || 'Unknown'}\n- Package: ${s.package_type || 'Unknown'}\n\n`;
    }
  }

  // Also include "other" category
  const otherServers = byCategory.get('other') ?? [];
  if (otherServers.length > 0) {
    content += `## Other\n\n`;
    for (const s of otherServers) {
      content += `### [${s.name}](${SITE_URL}/servers/${s.slug})\n`;
      content += `${s.description || 'No description.'}\n`;
      content += `- Stars: ${s.github_stars}\n- License: ${s.github_license || 'Unknown'}\n- Package: ${s.package_type || 'Unknown'}\n\n`;
    }
  }

  // Blog posts section
  if (blogPosts.length > 0) {
    content += `## Blog\n\n`;
    for (const post of blogPosts) {
      const lastUpdated = post.frontmatter.updatedAt || post.frontmatter.date;
      const excerpt = post.frontmatter.excerpt || post.frontmatter.description;
      content += `### [${post.frontmatter.title}](${SITE_URL}/blog/${post.slug})\n`;
      content += `Published: ${post.frontmatter.date} | Last updated: ${lastUpdated}\n`;
      content += `${excerpt}\n`;
      content += `Tags: ${post.frontmatter.tags.join(', ')}\n\n`;
    }
  }

  return new NextResponse(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
