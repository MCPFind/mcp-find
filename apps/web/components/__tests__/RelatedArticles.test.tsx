import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
vi.mock('@/lib/blog', () => ({ getAllPosts: () => [
  { slug: 'calendar-guide', frontmatter: { title: 'Calendar Guide', category: 'productivity', tags: ['calendar'] } },
  { slug: 'technical-guide', frontmatter: { title: 'Developer Guide', category: 'devtools', tags: ['devtools'] } },
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
});
