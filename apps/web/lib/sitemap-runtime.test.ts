import { beforeEach, describe, expect, it, vi } from 'vitest';
const queries = vi.hoisted(() => ({ getIndexableServerCount: vi.fn(), getServersSitemapPage: vi.fn(),
  getSitemapShardLastmod: vi.fn(), getIndexableSitemapMaxLastmod: vi.fn(), getCategoryLastUpdated: vi.fn() }));
vi.mock('@/lib/queries', () => queries);
vi.mock('@/lib/sitemap-static-pages', () => ({ getStaticSitemapEntries: vi.fn(async () => []), getStaticSitemapLastmod: vi.fn(async () => null) }));
vi.mock('next/navigation', () => ({ notFound: () => { throw Object.assign(new Error('Not found'), { digest: 'NEXT_NOT_FOUND' }); } }));
import { SITEMAP_CACHE_CONTROL } from './sitemap-lastmod';
import { getServersSitemapBatch } from './sitemap-servers';

const routes = import.meta.glob('../app/sitemap*.xml/route.ts');
beforeEach(() => {
  vi.clearAllMocks();
  queries.getIndexableServerCount.mockResolvedValue(955);
  queries.getSitemapShardLastmod.mockResolvedValue(null);
  const rows = Array.from({ length: 955 }, (_, i) => ({ slug: `legacy-${i}`, canonical_slug: `canonical-${i}`, lastmod: null }));
  queries.getServersSitemapPage.mockImplementation(async (offset, limit) => rows.slice(offset, offset + limit));
});

describe('runtime sitemap transport', () => {
  it('all twelve handlers opt out of prerendering and importing them reads no database', async () => {
    expect(Object.keys(routes)).toHaveLength(12);
    for (const load of Object.values(routes)) {
      const route = await load() as { dynamic: string };
      expect(route.dynamic).toBe('force-dynamic');
    }
    for (const query of Object.values(queries)) expect(query).not.toHaveBeenCalled();
  });
  it('preserves all 955 canonical URLs and advertises only the nonempty shard', async () => {
    const index = await import('../app/sitemap.xml/route');
    const first = await import('../app/sitemap-servers-0.xml/route');
    const future = await import('../app/sitemap-servers-2.xml/route');
    const indexXml = await (await index.GET()).text();
    expect(indexXml.match(/sitemap-servers-\d+\.xml/g)).toEqual(['sitemap-servers-0.xml']);
    const response = await first.GET();
    const xml = await response.text();
    expect(xml.match(/<url>/g)).toHaveLength(955);
    expect(xml).toContain('https://mcpfind.org/servers/canonical-954');
    expect(xml).not.toContain('/servers/legacy-');
    for (const header of ['Cache-Control', 'CDN-Cache-Control', 'Vercel-CDN-Cache-Control']) expect(response.headers.get(header)).toBe(SITEMAP_CACHE_CONTROL);
    const missing = await future.GET();
    expect(missing.status).toBe(404); expect(missing.headers.get('Cache-Control')).toBe('no-store');
  });
  it('returns 503/no-store with retry guidance for any unavailable sitemap, never empty XML', async () => {
    const outage = new Error('Directory temporarily unavailable');
    queries.getIndexableServerCount.mockRejectedValue(outage); queries.getServersSitemapPage.mockRejectedValue(outage);
    const staticQueries = await import('./sitemap-static-pages');
    vi.mocked(staticQueries.getStaticSitemapEntries).mockRejectedValueOnce(outage);
    for (const load of Object.values(routes)) {
      const route = await load() as { GET: () => Promise<Response> };
      const response = await route.GET();
      expect(response.status).toBe(503);
      expect(response.headers.get('Retry-After')).toBe('60');
      for (const header of ['Cache-Control', 'CDN-Cache-Control', 'Vercel-CDN-Cache-Control']) expect(response.headers.get(header)).toBe('no-store');
      expect(await response.text()).not.toContain('<urlset');
    }
  });
  it('rejects out-of-range and fractional shard indices before a database read', async () => {
    for (const index of [-1, 10, 1.5, NaN]) await expect(getServersSitemapBatch(index)).rejects.toThrow('Not found');
    expect(queries.getServersSitemapPage).not.toHaveBeenCalled();
  });
  it('returns a truthful zero-shard index only after a successful zero count', async () => {
    queries.getIndexableServerCount.mockResolvedValue(0);
    const index = await import('../app/sitemap.xml/route');
    const response = await index.GET();
    expect(response.status).toBe(200); expect(await response.text()).not.toContain('sitemap-servers-');
  });
});
