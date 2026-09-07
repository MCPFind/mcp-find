/**
 * Honest `<lastmod>` / `<changefreq>` derivation for every sitemap this site
 * emits.
 *
 * Background (2026-09 crawl-decay post-mortem). The sitemaps carried three
 * separate fabrications, and Google acted on all three:
 *
 *   1. `sitemap-servers-*.xml` hardcoded `<changefreq>daily</changefreq>` on
 *      every server URL. None of them changed daily. Most had not changed at
 *      all since 2026-03-25.
 *   2. `sitemap.xml` stamped `lastmod = today` on the index AND on every
 *      shard entry, unconditionally — while the shard bodies still reported
 *      2026-03-25. The index said "fresh", the shard said "stale". Google
 *      kept re-reading the index and stopped downloading the shard.
 *   3. `sitemap-static.xml` gave `/`, `/servers` and `/submit` a rolling
 *      `today` that moved every single request.
 *
 * The frozen 2026-03-25 stamp itself was never the lie — those pages really
 * had not changed (GH_ENRICHMENT_TOKEN had been 401ing since 2026-03-26).
 * The lie was everything wrapped around it.
 *
 * Rules encoded here:
 *   - A lastmod is only ever a REAL stored timestamp. Never `now()`.
 *   - When there is no real timestamp, emit NO `<lastmod>` at all. The
 *     sitemap protocol makes the element optional precisely so a publisher
 *     can decline to answer instead of inventing a date.
 *   - `changefreq` is derived from the actual age of that lastmod, and is
 *     likewise omitted when there is no lastmod to derive it from.
 *   - Element order follows the sitemap 0.9 XSD sequence
 *     (loc, lastmod, changefreq, priority). The previous emitters wrote
 *     changefreq and priority before lastmod, which the schema does not allow.
 */

import { escapeXml } from '@/lib/escape-xml';

/** W3C-datetime (date-only) form Google expects, or null if unparseable. */
export function toLastmodDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString().split('T')[0]!;
}

/**
 * The most recent of a set of candidate timestamps, ignoring nulls and
 * unparseable values. Returns null when nothing usable is present — the
 * signal to omit `<lastmod>` entirely rather than substitute a date.
 *
 * This is the `GREATEST(updated_at, registry_updated_at)` rule: both are
 * genuine change stamps for fields the server page renders, and either one
 * moving is a real change.
 */
export function maxLastmod(values: (string | null | undefined)[]): string | null {
  let best: string | null = null;
  let bestMs = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    if (!value) continue;
    const ms = new Date(value).getTime();
    if (Number.isNaN(ms)) continue;
    if (ms > bestMs) {
      bestMs = ms;
      best = value;
    }
  }
  return best;
}

/**
 * `changefreq` derived from how old the lastmod actually is — a description
 * of observed behaviour, not an aspiration. A page last touched five months
 * ago is not a daily page.
 *
 * Returns null when there is no lastmod: with nothing measured, there is
 * nothing honest to claim, so the element is omitted.
 */
export function changefreqForLastmod(
  lastmod: string | null | undefined,
  now: number = Date.now(),
): string | null {
  if (!lastmod) return null;
  const ms = new Date(lastmod).getTime();
  if (Number.isNaN(ms)) return null;

  const ageDays = (now - ms) / 86_400_000;
  // A future stamp is upstream clock skew, not a prediction. Treat as fresh.
  if (ageDays <= 7) return 'daily';
  if (ageDays <= 30) return 'weekly';
  if (ageDays <= 365) return 'monthly';
  return 'yearly';
}

export interface SitemapUrlEntry {
  loc: string;
  /** Raw timestamp; omitted from the output when null. */
  lastmod?: string | null;
  priority?: string;
  /**
   * Overrides the age-derived value. Only pass this for pages whose update
   * cadence is known independently of a stored timestamp (e.g. an editorial
   * blog index). Left undefined, changefreq is derived from `lastmod`.
   */
  changefreq?: string | null;
}

/** Renders one `<url>` block in XSD sequence order, omitting absent fields. */
export function renderSitemapUrl(entry: SitemapUrlEntry, now: number = Date.now()): string {
  const lastmodDate = toLastmodDate(entry.lastmod);
  const changefreq =
    entry.changefreq !== undefined ? entry.changefreq : changefreqForLastmod(entry.lastmod, now);

  const parts = [`    <loc>${escapeXml(entry.loc)}</loc>`];
  if (lastmodDate) parts.push(`    <lastmod>${lastmodDate}</lastmod>`);
  if (changefreq) parts.push(`    <changefreq>${changefreq}</changefreq>`);
  if (entry.priority) parts.push(`    <priority>${entry.priority}</priority>`);

  return `  <url>\n${parts.join('\n')}\n  </url>`;
}

/** Renders one `<sitemap>` block for the index, omitting an absent lastmod. */
export function renderSitemapIndexEntry(loc: string, lastmod: string | null): string {
  const lastmodDate = toLastmodDate(lastmod);
  const parts = [`    <loc>${escapeXml(loc)}</loc>`];
  if (lastmodDate) parts.push(`    <lastmod>${lastmodDate}</lastmod>`);
  return `  <sitemap>\n${parts.join('\n')}\n  </sitemap>`;
}

/**
 * Cache-Control for every sitemap route.
 *
 * The previous `public, max-age=86400` let a CDN/browser copy live for 24h,
 * which comfortably shadowed the 1h `unstable_cache` revalidation window
 * behind these routes — so a freshly-recomputed sitemap could sit unseen for
 * most of a day. `max-age=0` keeps clients from holding a private copy,
 * `s-maxage=3600` matches the shared cache to the revalidate window, and
 * `stale-while-revalidate` keeps the CDN serving during the recompute.
 */
export const SITEMAP_CACHE_CONTROL =
  'public, max-age=0, s-maxage=3600, stale-while-revalidate=86400';
