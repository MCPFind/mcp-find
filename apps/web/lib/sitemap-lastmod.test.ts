/**
 * sitemap-lastmod.test.ts
 *
 * Regression tests for the three fabrications that the 2026-09 crawl-decay
 * post-mortem identified in the sitemaps. Each `describe` below pins one of
 * them shut:
 *
 *   1. hardcoded `<changefreq>daily</changefreq>` on every server URL
 *   2. `lastmod = today` on the sitemap index and every shard entry
 *   3. a rolling `today` on `/`, `/servers` and `/submit`
 *
 * The shared property under all three: a sitemap may report a real stored
 * timestamp, or it may report nothing. It may never synthesise a date.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/lib/escape-xml', () => ({
  escapeXml: (s: string) => s,
}));

import {
  toLastmodDate,
  maxLastmod,
  changefreqForLastmod,
  renderSitemapUrl,
  renderSitemapIndexEntry,
  SITEMAP_CACHE_CONTROL,
} from './sitemap-lastmod';

const NOW = new Date('2026-09-05T12:00:00Z').getTime();

describe('maxLastmod — GREATEST(updated_at, registry_updated_at)', () => {
  it('returns the newer of two real timestamps', () => {
    expect(maxLastmod(['2026-03-25T00:00:00Z', '2026-09-05T00:00:00Z']))
      .toBe('2026-09-05T00:00:00Z');
    expect(maxLastmod(['2026-09-05T00:00:00Z', '2026-03-25T00:00:00Z']))
      .toBe('2026-09-05T00:00:00Z');
  });

  it('ignores nulls rather than treating them as a value', () => {
    expect(maxLastmod([null, '2026-03-25T00:00:00Z', undefined]))
      .toBe('2026-03-25T00:00:00Z');
  });

  it('returns null when nothing usable is present — the omit signal', () => {
    expect(maxLastmod([])).toBeNull();
    expect(maxLastmod([null, undefined])).toBeNull();
    expect(maxLastmod(['not-a-date'])).toBeNull();
  });

  it('never substitutes the current date for missing input', () => {
    const today = new Date().toISOString().split('T')[0];
    expect(toLastmodDate(maxLastmod([null]))).not.toBe(today);
  });
});

describe('changefreqForLastmod — derived from real age, never hardcoded', () => {
  it('does not report daily for a five-month-old page (the 452-URL bug)', () => {
    // 2026-03-25 is the last successful enrichment run. Every indexable URL
    // was frozen there and every one of them claimed <changefreq>daily</>.
    expect(changefreqForLastmod('2026-03-25T00:00:00Z', NOW)).toBe('monthly');
  });

  it('reports daily only for genuinely recent changes', () => {
    expect(changefreqForLastmod('2026-09-04T00:00:00Z', NOW)).toBe('daily');
  });

  it('walks the age buckets', () => {
    expect(changefreqForLastmod('2026-08-25T00:00:00Z', NOW)).toBe('weekly');
    expect(changefreqForLastmod('2026-07-01T00:00:00Z', NOW)).toBe('monthly');
    expect(changefreqForLastmod('2020-01-01T00:00:00Z', NOW)).toBe('yearly');
  });

  it('returns null with no lastmod — nothing measured, nothing claimed', () => {
    expect(changefreqForLastmod(null, NOW)).toBeNull();
    expect(changefreqForLastmod('nonsense', NOW)).toBeNull();
  });
});

describe('renderSitemapUrl — omits rather than invents', () => {
  it('emits no <lastmod> and no <changefreq> when there is no timestamp', () => {
    const xml = renderSitemapUrl({ loc: 'https://mcpfind.org/submit', priority: '0.5', lastmod: null }, NOW);
    expect(xml).not.toContain('<lastmod>');
    expect(xml).not.toContain('<changefreq>');
    expect(xml).toContain('<loc>https://mcpfind.org/submit</loc>');
    expect(xml).toContain('<priority>0.5</priority>');
  });

  it('emits the real date, not today, when a timestamp exists', () => {
    const xml = renderSitemapUrl({ loc: 'https://mcpfind.org/servers/x', lastmod: '2026-03-25T09:00:00Z' }, NOW);
    expect(xml).toContain('<lastmod>2026-03-25</lastmod>');
    expect(xml).not.toContain('2026-09-05');
  });

  it('emits elements in sitemap 0.9 XSD sequence order (loc, lastmod, changefreq, priority)', () => {
    const xml = renderSitemapUrl(
      { loc: 'https://mcpfind.org/', lastmod: '2026-09-04T00:00:00Z', priority: '1.0' },
      NOW,
    );
    expect(xml.indexOf('<loc>')).toBeLessThan(xml.indexOf('<lastmod>'));
    expect(xml.indexOf('<lastmod>')).toBeLessThan(xml.indexOf('<changefreq>'));
    expect(xml.indexOf('<changefreq>')).toBeLessThan(xml.indexOf('<priority>'));
  });
});

describe('renderSitemapIndexEntry — no unconditional today stamp', () => {
  it('omits <lastmod> when the shard has no real timestamp', () => {
    const xml = renderSitemapIndexEntry('https://mcpfind.org/sitemap-servers-0.xml', null);
    expect(xml).not.toContain('<lastmod>');
  });

  it('reports the shard contents date, which may be far in the past', () => {
    const xml = renderSitemapIndexEntry('https://mcpfind.org/sitemap-servers-0.xml', '2026-03-25T00:00:00Z');
    expect(xml).toContain('<lastmod>2026-03-25</lastmod>');
  });
});

describe('SITEMAP_CACHE_CONTROL', () => {
  it('does not let a shared cache copy outlive the 1h unstable_cache window', () => {
    expect(SITEMAP_CACHE_CONTROL).toContain('s-maxage=3600');
    expect(SITEMAP_CACHE_CONTROL).toContain('max-age=0');
    expect(SITEMAP_CACHE_CONTROL).not.toContain('max-age=86400,');
  });
});

describe('index/shard agreement — the contradiction that stopped shard downloads', () => {
  let realNow: () => number;

  beforeEach(() => {
    realNow = Date.now;
  });
  afterEach(() => {
    Date.now = realNow;
  });

  it('an index entry can never be newer than the URLs it points at', () => {
    // Both sides derive from the same row set, so the max over the shard IS
    // the index value. This test states the invariant that the old code —
    // index stamped `today`, shard bodies stamped 2026-03-25 — violated.
    const shardRows = ['2026-03-25T00:00:00Z', '2026-02-01T00:00:00Z', null];
    const indexLastmod = maxLastmod(shardRows);

    expect(indexLastmod).toBe('2026-03-25T00:00:00Z');

    const indexXml = renderSitemapIndexEntry('https://mcpfind.org/sitemap-servers-0.xml', indexLastmod);
    const shardMax = Math.max(
      ...shardRows.filter(Boolean).map(r => new Date(r as string).getTime()),
    );
    expect(new Date(indexLastmod as string).getTime()).toBeLessThanOrEqual(shardMax);
    expect(indexXml).not.toContain(new Date().toISOString().split('T')[0]!);
  });
});
