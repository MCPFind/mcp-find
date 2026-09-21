import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
vi.mock('@/lib/blog', () => ({ getAllPosts: () => [
  { slug: 'calendar-guide', frontmatter: { title: 'Calendar Guide', category: 'productivity', tags: ['calendar'] } },
  { slug: 'technical-guide', frontmatter: { title: 'Developer Guide', category: 'devtools', tags: ['devtools'] } },
  { slug: 'monday-mcp-server-ai-agents', frontmatter: { title: 'Monday Guide', category: 'productivity', tags: ['monday.com'] } },
  { slug: 'mcp-for-accountants-quickbooks-xero', frontmatter: { title: 'Xero Guide', category: 'finance', tags: ['xero'] } },
  { slug: 'mysql-mcp-server-setup-guide', frontmatter: { title: 'MySQL Guide', category: 'databases', tags: ['mysql'] } },
] }));
import { RelatedArticles } from '../related-articles';

describe('task relevance', () => {
  it('does not treat technical or historical text as an iCal task', async () => {
    const html = renderToStaticMarkup(await RelatedArticles({ serverCategory: 'devtools', serverName: 'Technical Tool', serverDescription: 'Historical data' }));
    expect(html).toContain('Developer Guide');
    expect(html).not.toContain('Calendar Guide');
  });
  it('prefers explicit calendar tasks over a stale broad category', async () => {
    const html = renderToStaticMarkup(await RelatedArticles({ serverCategory: 'devtools', serverName: 'Google Calendar' }));
    expect(html).toContain('Calendar Guide');
    expect(html).not.toContain('Developer Guide');
  });

  it.each([
    ['com-monday-monday-com', 'Monday Guide'],
    ['io-github-asklokesh-xero-mcp-server', 'Xero Guide'],
    ['io-github-neverinfamous-mysql-mcp', 'MySQL Guide'],
  ])('prefers the editorial override for %s', async (serverSlug, title) => {
    const html = renderToStaticMarkup(await RelatedArticles({
      serverSlug,
      serverCategory: 'devtools',
      serverName: 'Unrelated server',
    }));
    expect(html).toContain(title);
    expect(html).not.toContain('Developer Guide');
  });

  it('falls back to category matching when a slug has no override', async () => {
    const html = renderToStaticMarkup(await RelatedArticles({
      serverSlug: 'unmapped-server',
      serverCategory: 'devtools',
      serverName: 'Technical Tool',
    }));
    expect(html).toContain('Developer Guide');
  });

  it.each([
    ['monday-mcp-server-ai-agents.mdx', '/servers/com-monday-monday-com'],
    ['mcp-for-accountants-quickbooks-xero.mdx', '/servers/io-github-asklokesh-xero-mcp-server'],
    ['mysql-mcp-server-setup-guide.mdx', '/servers/io-github-neverinfamous-mysql-mcp'],
  ])('keeps the reciprocal server link in %s', (filename, serverPath) => {
    const source = readFileSync(
      new URL(`../../content/blog/${filename}`, import.meta.url),
      'utf8',
    );
    expect(source).toContain(`](${serverPath})`);
  });
});
