import { getAllPosts } from '@/lib/blog';
import { escapeXml } from '@/lib/escape-xml';
import { SITE_URL } from '@mcpfind/shared';

export const dynamic = 'force-dynamic';

export async function GET() {
  const posts = getAllPosts();

  const items = posts.map(post => {
    const description = post.frontmatter.excerpt ?? post.frontmatter.description;
    const link = `${SITE_URL}/blog/${post.slug}`;
    const pubDate = new Date(post.frontmatter.date).toUTCString();
    const categories = post.frontmatter.tags
      .map(tag => `    <category>${escapeXml(tag)}</category>`)
      .join('\n');

    return `  <item>
    <title>${escapeXml(post.frontmatter.title)}</title>
    <link>${link}</link>
    <guid isPermaLink="true">${link}</guid>
    <description><![CDATA[${description}]]></description>
    <author>${escapeXml(post.frontmatter.author)}</author>
    <pubDate>${pubDate}</pubDate>
${categories}
  </item>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>MCP Find Blog</title>
    <link>${SITE_URL}/blog</link>
    <description>Guides, tutorials, and analysis on MCP servers and the Model Context Protocol.</description>
    <language>en-us</language>
    <atom:link href="${SITE_URL}/blog/feed.xml" rel="self" type="application/rss+xml"/>
    <image>
      <url>${SITE_URL}/og-image-mcp.png</url>
      <title>MCP Find Blog</title>
      <link>${SITE_URL}/blog</link>
    </image>
${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
