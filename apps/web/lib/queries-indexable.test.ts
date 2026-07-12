/**
 * queries-indexable.test.ts
 *
 * Regression tests proving the sitemap query layer (getServersSitemapPage)
 * and the generateStaticParams query layer (getIndexableServerSlugs) both
 * apply the isIndexable() gate to rows fetched from Supabase — this is the
 * load-bearing crawl-budget fix for Stage-6 Recovery Slice 2 (see
 * specs/stage-6-slices/slice-2-quality-gate-sitemap-prune.md, gitignored).
 *
 * Supabase is mocked; unstable_cache is mocked as a passthrough (no real
 * cross-request caching in tests) so we can assert on the actual filtering
 * behavior without a live DB connection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/cache', () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

// react's cache() memoizes per-request; passthrough is fine for these tests
// since each test calls the exported function directly without needing dedup.
vi.mock('react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react')>();
  return {
    ...actual,
    cache: (fn: (...args: unknown[]) => unknown) => fn,
  };
});

// Chainable Supabase query builder mock — each method returns `this` except
// the final await, which resolves via a configurable `__result`.
function makeSupabaseQueryMock(result: { data: unknown[] | null }) {
  const chain: Record<string, unknown> = {};
  const methods = ['from', 'select', 'eq', 'order', 'range'];
  for (const m of methods) {
    chain[m] = vi.fn(() => chain);
  }
  // Supabase query builders are thenable — awaiting resolves the query.
  chain.then = (resolve: (v: unknown) => void) => resolve(result);
  return chain;
}

const GOOD_SERVER = {
  slug: 'good-server',
  canonical_slug: 'good-server',
  updated_at: '2026-07-01T00:00:00Z',
  registry_status: 'active',
  github_archived: false,
  readme_content: 'A comprehensive README describing setup and usage. '.repeat(10),
  has_tools: true,
  tool_count: 5,
  package_name: '@acme/mcp-server-good',
  package_type: 'npm',
  github_stars: 4200,
  category: 'developer-tools',
};

const THIN_SERVER = {
  slug: 'thin-server',
  canonical_slug: 'thin-server',
  updated_at: '2026-07-01T00:00:00Z',
  registry_status: 'active',
  github_archived: false,
  readme_content: null,
  has_tools: false,
  tool_count: 0,
  package_name: null,
  package_type: null,
  github_stars: 0,
  category: null,
};

describe('getServersSitemapPage — applies isIndexable() gate', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('includes the good server and excludes the thin server', async () => {
    const queryMock = makeSupabaseQueryMock({ data: [GOOD_SERVER, THIN_SERVER] });
    vi.doMock('./supabase', () => ({ supabase: queryMock }));

    const { getServersSitemapPage } = await import('./queries');
    const rows = await getServersSitemapPage(0, 1000);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.slug).toBe('good-server');
  });

  it('returns rows without the signal columns leaking into the result shape', async () => {
    const queryMock = makeSupabaseQueryMock({ data: [GOOD_SERVER] });
    vi.doMock('./supabase', () => ({ supabase: queryMock }));

    const { getServersSitemapPage } = await import('./queries');
    const rows = await getServersSitemapPage(0, 1000);

    expect(rows[0]).toEqual({
      slug: 'good-server',
      canonical_slug: 'good-server',
      updated_at: '2026-07-01T00:00:00Z',
    });
  });

  it('returns an empty array when all rows are thin', async () => {
    const queryMock = makeSupabaseQueryMock({ data: [THIN_SERVER] });
    vi.doMock('./supabase', () => ({ supabase: queryMock }));

    const { getServersSitemapPage } = await import('./queries');
    const rows = await getServersSitemapPage(0, 1000);

    expect(rows).toHaveLength(0);
  });
});

describe('getIndexableServerSlugs — applies isIndexable() gate for generateStaticParams', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns canonical_slug for indexable servers only, capped at limit', async () => {
    const queryMock = makeSupabaseQueryMock({ data: [GOOD_SERVER, THIN_SERVER] });
    vi.doMock('./supabase', () => ({ supabase: queryMock }));

    const { getIndexableServerSlugs } = await import('./queries');
    const slugs = await getIndexableServerSlugs(1200);

    expect(slugs).toEqual(['good-server']);
  });

  it('falls back to slug when canonical_slug is null', async () => {
    const rowWithNullCanonical = { ...GOOD_SERVER, canonical_slug: null };
    const queryMock = makeSupabaseQueryMock({ data: [rowWithNullCanonical] });
    vi.doMock('./supabase', () => ({ supabase: queryMock }));

    const { getIndexableServerSlugs } = await import('./queries');
    const slugs = await getIndexableServerSlugs(1200);

    expect(slugs).toEqual(['good-server']);
  });
});
