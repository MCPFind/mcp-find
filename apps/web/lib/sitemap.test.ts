/**
 * sitemap.test.ts
 *
 * Regression tests for the dynamic sitemap shard system.
 *
 * Verifies:
 * 1. The index route lists exactly min(ceil(total/BATCH_SIZE), MAX_BATCHES) server shards.
 * 2. Shard handler returns non-empty XML for in-range indices (0, 1, 2).
 * 3. Shard handler calls notFound() for out-of-range indices.
 * 4. Zero-server edge case: index lists 0 shards; shard-0 calls notFound().
 *
 * All DB/query calls are mocked — no real Supabase connection required.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { notFound } from 'next/navigation';

// ---------------------------------------------------------------------------
// Module mocks — must be declared before imports that use them
// ---------------------------------------------------------------------------

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); }),
}));

vi.mock('@mcpfind/shared', () => ({
  SITE_URL: 'https://mcpfind.org',
}));

vi.mock('@/lib/escape-xml', () => ({
  escapeXml: (s: string) => s,
}));

// getServerCount and getServersSitemapPage are mocked per-test via vi.mock
vi.mock('@/lib/queries', () => ({
  getServerCount: vi.fn(),
  getServersSitemapPage: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeServerRow(slug: string) {
  return { slug, canonical_slug: null, updated_at: '2024-01-01T00:00:00Z' };
}

function makeServerBatch(size: number, startIndex = 0) {
  return Array.from({ length: size }, (_, i) =>
    makeServerRow(`server-${startIndex + i}`),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sitemap index — shard count', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('lists exactly 3 server shards when total=12555 (ceil(12555/5000)=3, capped at 10)', async () => {
    const { getServerCount } = await import('@/lib/queries');
    vi.mocked(getServerCount).mockResolvedValue(12555);

    const { GET } = await import('@/app/sitemap.xml/route');
    const response = await GET();
    const body = await response.text();

    // Should contain exactly 3 sitemap-servers-N.xml entries
    const shardMatches = body.match(/sitemap-servers-\d+\.xml/g) ?? [];
    expect(shardMatches).toHaveLength(3);
    expect(shardMatches).toContain('sitemap-servers-0.xml');
    expect(shardMatches).toContain('sitemap-servers-1.xml');
    expect(shardMatches).toContain('sitemap-servers-2.xml');
    expect(shardMatches).not.toContain('sitemap-servers-3.xml');
  });

  it('caps at MAX_BATCHES=10 when total exceeds 50000', async () => {
    const { getServerCount } = await import('@/lib/queries');
    vi.mocked(getServerCount).mockResolvedValue(99999);

    const { GET } = await import('@/app/sitemap.xml/route');
    const response = await GET();
    const body = await response.text();

    const shardMatches = body.match(/sitemap-servers-\d+\.xml/g) ?? [];
    expect(shardMatches).toHaveLength(10);
    expect(shardMatches).toContain('sitemap-servers-9.xml');
    expect(shardMatches).not.toContain('sitemap-servers-10.xml');
  });

  it('lists 1 shard when total=1', async () => {
    const { getServerCount } = await import('@/lib/queries');
    vi.mocked(getServerCount).mockResolvedValue(1);

    const { GET } = await import('@/app/sitemap.xml/route');
    const response = await GET();
    const body = await response.text();

    const shardMatches = body.match(/sitemap-servers-\d+\.xml/g) ?? [];
    expect(shardMatches).toHaveLength(1);
    expect(shardMatches).toContain('sitemap-servers-0.xml');
  });

  it('lists 0 server shards when total=0', async () => {
    const { getServerCount } = await import('@/lib/queries');
    vi.mocked(getServerCount).mockResolvedValue(0);

    const { GET } = await import('@/app/sitemap.xml/route');
    const response = await GET();
    const body = await response.text();

    const shardMatches = body.match(/sitemap-servers-\d+\.xml/g) ?? [];
    expect(shardMatches).toHaveLength(0);
    expect(shardMatches).not.toContain('sitemap-servers-0.xml');
  });
});

describe('getServersSitemapBatch — shard handler', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns non-empty XML for batch index 0 (first 5000)', async () => {
    const { getServersSitemapPage } = await import('@/lib/queries');
    vi.mocked(getServersSitemapPage).mockResolvedValue(makeServerBatch(5000, 0));

    const { getServersSitemapBatch } = await import('@/lib/sitemap-servers');
    const response = await getServersSitemapBatch(0);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('<urlset');
    expect(body).toContain('server-0');
    expect(body).toContain('server-4999');
  });

  it('returns non-empty XML for batch index 1 (servers 5000–9999)', async () => {
    const { getServersSitemapPage } = await import('@/lib/queries');
    vi.mocked(getServersSitemapPage).mockResolvedValue(makeServerBatch(5000, 5000));

    const { getServersSitemapBatch } = await import('@/lib/sitemap-servers');
    const response = await getServersSitemapBatch(1);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('server-5000');
    expect(body).toContain('server-9999');
  });

  it('returns non-empty XML for batch index 2 (servers 10000–12554)', async () => {
    const { getServersSitemapPage } = await import('@/lib/queries');
    vi.mocked(getServersSitemapPage).mockResolvedValue(makeServerBatch(2555, 10000));

    const { getServersSitemapBatch } = await import('@/lib/sitemap-servers');
    const response = await getServersSitemapBatch(2);
    const body = await response.text();

    expect(response.status).toBe(200);
    expect(body).toContain('server-10000');
    expect(body).toContain('server-12554');
  });

  it('calls notFound() for an out-of-range index (batch 15, > MAX_BATCHES=10)', async () => {
    const { getServersSitemapBatch } = await import('@/lib/sitemap-servers');

    await expect(getServersSitemapBatch(15)).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });

  it('calls notFound() for negative index', async () => {
    const { getServersSitemapBatch } = await import('@/lib/sitemap-servers');

    await expect(getServersSitemapBatch(-1)).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });

  it('calls notFound() for an index beyond the actual data (empty batch, index > 0)', async () => {
    const { getServersSitemapPage } = await import('@/lib/queries');
    vi.mocked(getServersSitemapPage).mockResolvedValue([]);

    const { getServersSitemapBatch } = await import('@/lib/sitemap-servers');

    await expect(getServersSitemapBatch(3)).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });

  it('calls notFound() for batch index 0 when DB returns empty servers (zero-server DB)', async () => {
    const { getServersSitemapPage } = await import('@/lib/queries');
    vi.mocked(getServersSitemapPage).mockResolvedValue([]);

    const { getServersSitemapBatch } = await import('@/lib/sitemap-servers');

    await expect(getServersSitemapBatch(0)).rejects.toThrow('NEXT_NOT_FOUND');
    expect(notFound).toHaveBeenCalled();
  });
});
