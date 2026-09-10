import { directoryUnavailable } from '@/lib/directory-response';
import { NextResponse } from 'next/server';
import { getServerCount, getIndexableTopServers } from '@/lib/queries';
import { SITE_NAME, SITE_URL, CATEGORY_LABELS, CATEGORY_LLM_DESCRIPTIONS } from '@mcpfind/shared';
import type { Category } from '@mcpfind/shared';
import { getAllPosts } from '@/lib/blog';

export const dynamic = 'force-dynamic';
export const maxDuration = 15;

async function render() {
  const [count, topServers] = await Promise.all([
    getServerCount(),
    getIndexableTopServers(20),
  ]);
  const blogPosts = getAllPosts({ limit: 10 });

  const categoryLines = Object.entries(CATEGORY_LLM_DESCRIPTIONS)
    .map(([key, description]) => `- [${CATEGORY_LABELS[key as Category]} Servers](${SITE_URL}/categories/${key}): ${description}`)
    .join('\n');

  const topServerLines = topServers
    .map(s => `- [${s.name}](${SITE_URL}/servers/${s.canonical_slug ?? s.slug}): ${(s.description || '').slice(0, 100)}`)
    .join('\n');

  const blogLines = blogPosts
    .map(p => `- [${p.frontmatter.title}](${SITE_URL}/blog/${p.slug}): ${p.frontmatter.description.slice(0, 100)}`)
    .join('\n');

  const content = `# ${SITE_NAME}

> Open-source directory of ${count}+ MCP (Model Context Protocol) servers — search, filter,
> and copy install configs for Claude Desktop, Cursor, VS Code, Windsurf, and Claude Code.

## Popular Categories
${categoryLines}

## API
- [Server List API](${SITE_URL}/api/servers): JSON API for searching and filtering all MCP servers with full-text search
- [Server Detail API](${SITE_URL}/api/servers/postgres-mcp): Full metadata, tools, schemas, and install configs per server
- [Config Generator API](${SITE_URL}/api/servers/postgres-mcp/config/claude-desktop): Generate install config for any MCP client

## Top Servers
${topServerLines}

## Blog
${blogLines}
`;

  return new NextResponse(content, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=21600, stale-while-revalidate=86400',
      'CDN-Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400',
      'Vercel-CDN-Cache-Control': 'public, s-maxage=21600, stale-while-revalidate=86400',
    },
  });
}

export async function GET() {
  try { return await render(); } catch { return directoryUnavailable(); }
}
