/**
 * revalidate-route.test.ts
 *
 * T1 (WS-Cache, sprint 2026-08-25-cache-and-indexing): proves the
 * /api/revalidate route no longer calls revalidateTag('servers')
 * unconditionally on every invocation.
 *
 * Pre-fix (mcp-find main 6818cb5), POST always called revalidateTag('servers')
 * regardless of the request body — the ONLY tag every one of the 12
 * unstable_cache call sites in lib/queries.ts shares — so the daily sync's
 * "Bust Vercel cache" step (.github/workflows/sync.yml) purged EVERY cached
 * server on every run, capping the intended 7-day ISR window on
 * /servers/[slug] (getServerBySlug, revalidate: 604800) at an effective
 * ~24h ceiling regardless of which rows actually changed.
 *
 * Post-fix, the route accepts { slugs: string[] } and busts only the
 * per-slug `server-<slug>` tags plus the narrow 'servers-listing' aggregate
 * tag — the blanket 'servers' tag is only busted on an explicit { full: true }
 * opt-in, never by default.
 *
 * This file lives under lib/ (not app/api/revalidate/) purely so it is
 * picked up by vitest.config.ts's existing `lib/**\/*.test.ts` include glob
 * without needing to widen that glob — it imports the route handler via a
 * relative path.
 *
 * next/cache is mocked so no real Next.js cache runtime is required; the
 * route module is imported fresh per test via vi.resetModules() + dynamic
 * import so each test gets an independent revalidateTag call log.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

const TOKEN = 'test-revalidate-token-1234567890';

const revalidateTagMock = vi.fn();
vi.mock('next/cache', () => ({
  revalidateTag: (...args: unknown[]) => revalidateTagMock(...args),
}));

async function loadRoute() {
  vi.resetModules();
  const mod = await import('../app/api/revalidate/route');
  return mod.POST;
}

// NextRequest wants a NextRequest instance in the real handler's type, but
// at runtime the route only touches the Request/Headers surface (headers.get,
// text()) — a plain Request satisfies that without pulling in the full
// Next.js server runtime. `unknown` first avoids an unsafe direct Request→
// NextRequest cast while still keeping the test free of `any`.
function makeRequest(body: unknown, opts: { token?: string | null } = {}): NextRequest {
  const headers: Record<string, string> = {};
  const token = opts.token === undefined ? TOKEN : opts.token;
  if (token !== null) headers['x-revalidate-token'] = token;
  // Use a fresh, high-numbered IP per call site indirectly via header so the
  // in-memory rate limiter (10 req/min/IP) never trips across this file's
  // many small requests — NextRequest reads x-real-ip first.
  headers['x-real-ip'] = '203.0.113.' + String(Math.floor(Math.random() * 250) + 1);

  const req = new Request('https://mcpfind.org/api/revalidate', {
    method: 'POST',
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return req as unknown as NextRequest;
}

describe('POST /api/revalidate — T1 per-slug invalidation', () => {
  beforeEach(() => {
    revalidateTagMock.mockClear();
    process.env.REVALIDATE_TOKEN = TOKEN;
  });

  it('[AC2/AC3] busts only per-slug + aggregate tags when slugs are supplied — never the blanket "servers" tag', async () => {
    const POST = await loadRoute();
    const res = await POST(makeRequest({ slugs: ['alpha', 'beta'] }));
    expect(res.status).toBe(200);

    const calledTags = revalidateTagMock.mock.calls.map((c) => c[0]);
    expect(calledTags).toContain('server-alpha');
    expect(calledTags).toContain('server-beta');
    expect(calledTags).toContain('servers-listing');
    // This is the pre-fix defect this test exists to catch: an unconditional
    // blanket purge regardless of payload. At 6818cb5 this assertion FAILS
    // because the pre-fix route always calls revalidateTag('servers').
    expect(calledTags).not.toContain('servers');
  });

  it('[AC3] a body with no slugs (packages/sync\'s internal Stage-4 call sends no body at all) busts only the aggregate tag, not the blanket tag', async () => {
    const POST = await loadRoute();
    const res = await POST(makeRequest(undefined));
    expect(res.status).toBe(200);

    const calledTags = revalidateTagMock.mock.calls.map((c) => c[0]);
    expect(calledTags).toEqual(['servers-listing']);
  });

  it('[AC3, negative guard] the blanket "servers" tag is still reachable, but ONLY via an explicit { full: true } opt-in', async () => {
    const POST = await loadRoute();
    const res = await POST(makeRequest({ full: true }));
    expect(res.status).toBe(200);

    const calledTags = revalidateTagMock.mock.calls.map((c) => c[0]);
    expect(calledTags).toEqual(['servers']);
  });

  it('rejects a request with an invalid/missing token before touching any cache tag (unchanged auth behavior)', async () => {
    const POST = await loadRoute();
    const res = await POST(makeRequest({ slugs: ['alpha'] }, { token: 'wrong-token' }));
    expect(res.status).toBe(401);
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });
});
