/**
 * /api/servers (list) route tests.
 *
 * Public JSON API advertised in llms.txt; input validation, the limit cap
 * and the 503 degradation contract were untested.
 *
 * @/lib/queries and @/lib/filter-utils are mocked — no live DB.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/queries', () => ({
  listServers: vi.fn(),
}));
vi.mock('@/lib/filter-utils', () => ({
  parseFilterParams: () => ({}),
}));

import { GET } from './route';
import { listServers } from '@/lib/queries';

const mockListServers = vi.mocked(listServers);

function req(url: string): NextRequest {
  return new NextRequest(`http://localhost/api/servers${url}`);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockListServers.mockResolvedValue({ servers: [], total: 0 } as never);
});

describe('GET /api/servers', () => {
  it('returns results with the 6h CDN cache header', async () => {
    const res = await GET(req(''));
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=21600');
    expect(await res.json()).toEqual({ servers: [], total: 0 });
  });

  it('passes validated params through to listServers', async () => {
    await GET(req('?page=2&limit=10&sort=name&status=deprecated&category=databases&q=postgres'));
    expect(mockListServers).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 2,
        limit: 10,
        sort: 'name',
        status: 'deprecated',
        category: 'databases',
        q: 'postgres',
      })
    );
  });

  it.each([
    ['page=0', 'page below range'],
    ['page=101', 'page above range'],
    ['page=1.5', 'non-integer page'],
    ['limit=0', 'limit below range'],
    ['q=' + 'x'.repeat(121), 'query over 120 chars'],
  ])('rejects %s (%s) with 400', async (query) => {
    const res = await GET(req(`?${query}`));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid page or limit');
  });

  it('caps limit at 100 before calling the query layer', async () => {
    await GET(req('?limit=500'));
    expect(mockListServers).toHaveBeenCalledWith(expect.objectContaining({ limit: 100 }));
  });

  it.each([
    ['category=nope', 'Invalid category'],
    ['sort=random', 'Invalid sort'],
    ['status=archived', 'Invalid status'],
  ])('rejects %s with 400 %s', async (query, error) => {
    const res = await GET(req(`?${query}`));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe(error);
  });

  it('degrades to 503 with Retry-After when the query layer fails', async () => {
    mockListServers.mockRejectedValue(new Error('db down') as never);
    const res = await GET(req(''));
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('30');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});
