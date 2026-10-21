/**
 * /api/servers/[slug] (detail) route tests.
 *
 * Slug format validation, 404/503 semantics and the 7-day CDN cache
 * contract were untested. @/lib/queries is mocked — no live DB.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/queries', () => ({
  getServerBySlug: vi.fn(),
}));

import { GET } from './route';
import { getServerBySlug } from '@/lib/queries';

const mockGetServerBySlug = vi.mocked(getServerBySlug);

function call(slug: string) {
  return GET(new NextRequest(`http://localhost/api/servers/${slug}`), {
    params: Promise.resolve({ slug }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/servers/[slug]', () => {
  it.each([
    ['Bad_Slug', 'uppercase/underscore'],
    ['-leading-dash', 'leading dash'],
    ['slug_with_underscore', 'underscore'],
    ['slug.with.dot', 'dot'],
  ])('rejects malformed slug %s (%s) with 400', async (slug) => {
    const res = await call(slug);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid slug format');
    expect(mockGetServerBySlug).not.toHaveBeenCalled();
  });

  it('returns the server with the 7-day CDN cache header', async () => {
    const server = { slug: 'my-server', name: 'My Server' };
    mockGetServerBySlug.mockResolvedValue(server as never);
    const res = await call('my-server');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=604800');
    expect(await res.json()).toEqual(server);
  });

  it('returns 404 when the server does not exist', async () => {
    mockGetServerBySlug.mockResolvedValue(null as never);
    const res = await call('missing-server');
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('Server not found');
  });

  it('degrades to 503 with Retry-After when the query layer fails', async () => {
    mockGetServerBySlug.mockRejectedValue(new Error('db down') as never);
    const res = await call('my-server');
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('30');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });
});
