import { describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '../middleware';
import { normalizeListParams, parseFilterParams } from './filter-utils';

function request(path: string) { return new NextRequest(`https://mcpfind.org${path}`); }

describe('finite browse route separation', () => {
  it('leaves canonical browsing on its ISR page', () => {
    expect(middleware(request('/servers')).headers.get('x-middleware-rewrite')).toBe('https://mcpfind.org/directory-root/servers');
    expect(middleware(request('/')).headers.get('x-middleware-rewrite')).toBe('https://mcpfind.org/directory-root/home');
    expect(middleware(request('/categories')).headers.get('x-middleware-rewrite')).toBe('https://mcpfind.org/directory-root/categories');
    expect(middleware(request('/directory-root/home')).status).toBe(404);
  });
  it('rewrites default pagination to finite ISR pages without changing the public URL', () => {
    expect(middleware(request('/servers?page=2')).headers.get('x-middleware-rewrite')).toBe('https://mcpfind.org/directory-page/2?page=2');
  });
  it('isolates search and rejects excessive depth and search length', () => {
    expect(middleware(request('/servers?q=calendar')).headers.get('x-middleware-rewrite')).toBe('https://mcpfind.org/directory-search?q=calendar');
    expect(middleware(request('/servers?page=101')).status).toBe(400);
    expect(middleware(request('/servers?q=' + 'x'.repeat(121))).status).toBe(400);
  });
  it('redirects duplicate filter permutations and defaults to one public URL', () => {
    expect(middleware(request('/servers?pkg=pypi,npm,npm&sort=stars')).headers.get('location')).toBe('https://mcpfind.org/servers?pkg=npm%2Cpypi');
    expect(middleware(request('/servers?page=1')).headers.get('location')).toBe('https://mcpfind.org/servers');
    expect(middleware(request('/servers?unknown=garbage')).headers.get('location')).toBe('https://mcpfind.org/servers');
  });
  it('normalizes malformed filters consistently before data caching', () => {
    expect(parseFilterParams({ lang: 'madeup,Python,Python', page: 'NaN' })).toMatchObject({ languages: ['Python'], page: 1 });
    expect(normalizeListParams({ page: 100000, q: '  query   text  ' })).toMatchObject({ page: 100, q: 'query text', status: 'active' });
  });
});

vi.mock('./queries', () => ({ listServers: vi.fn(), getServerBySlug: vi.fn() }));
import { listServers, getServerBySlug } from './queries';
import { GET as list } from '../app/api/servers/route';
import { GET as detail } from '../app/api/servers/[slug]/route';

describe('availability HTTP semantics', () => {
  it('returns uncacheable retryable 503 for a directory outage', async () => {
    vi.mocked(listServers).mockRejectedValueOnce(new Error('unavailable'));
    const response = await list(request('/api/servers'));
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('retry-after')).toBe('30');
  });
  it('keeps detail outage distinct from genuine absence', async () => {
    vi.mocked(getServerBySlug).mockRejectedValueOnce(new Error('unavailable'));
    const response = await detail(request('/api/servers/one'), { params: Promise.resolve({ slug: 'one' }) });
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    vi.mocked(getServerBySlug).mockResolvedValueOnce(null);
    expect((await detail(request('/api/servers/one'), { params: Promise.resolve({ slug: 'one' }) })).status).toBe(404);
  });
});
