/**
 * Single source of truth for "is this server page worth Google's crawl budget?"
 *
 * Background: the sitemap used to emit every non-deprecated server row
 * (~15k+ as of 2026-07) with no quality filter, which is what triggered
 * Google's crawl-budget/quality verdict and the resulting deindexing
 * (STATUS.md Stage-6 Open Decision #3). This predicate is the ONE place
 * that decides "indexable" — imported by the sitemap query, the server-page
 * robots meta, and generateStaticParams. Do NOT reimplement this logic
 * inline anywhere else; a duplicated `canonical_slug ?? slug` pattern across
 * files was exactly the bug Slice 1 fixed, and duplicating this predicate
 * would reintroduce the same class of drift.
 *
 * This is independent of (and stacks with) the existing manifest-driven
 * `quality_status` gate (apps/web/lib/quality-status.ts, BROKEN -> noindex).
 * That system is a manually-curated v1 audit covering a shrinking fraction
 * of the current server count; this predicate is fully source-data-driven
 * and covers every row automatically, no manifest required.
 */

/** Minimal shape this predicate needs — a subset of `Server`/`ServerListItem`. */
export interface IndexableServerInput {
  registry_status: 'active' | 'deprecated';
  github_archived: boolean;
  /**
   * Trimmed character length of the README, NOT the README itself.
   *
   * This used to be `readme_content: string | null`, which forced every
   * caller that wanted to evaluate this predicate over a large row set — the
   * sitemap scan above all — to SELECT the full README body across the whole
   * `servers` table purely to compute one comparison. With READMEs NULL on
   * ~97.8% of rows that scan was ~7 MB; a repaired enrichment backfill would
   * have made it ~250 MB per request (~21k enrichable rows, ~12 KB mean
   * README), on every `force-dynamic` sitemap route. Carrying the length
   * instead makes the same decision from 4 bytes per row.
   *
   * Null means "no README" — indistinguishable from an empty one for this
   * predicate's purposes, and treated the same way the old `null` content was.
   *
   * Postgres computes this column (migration 010, a GENERATED ALWAYS ...
   * STORED column) so it can never drift from `readme_content`. Callers that
   * already hold the body — the server detail page, which renders it — should
   * derive the number with `readmeLengthOf()` rather than reading a column.
   */
  readme_length: number | null;
  has_tools: boolean;
  tool_count: number;
  package_name: string | null;
  package_type: string | null;
  github_stars: number;
  category: string | null;
}

/** README must clear this length to count as "real content" (signal 1). */
const README_MIN_LENGTH = 400;

/**
 * The exact JS expression the README signal used to inline, extracted so the
 * one caller that legitimately holds the README body (the server detail page)
 * produces the same number the database's generated `readme_length` column
 * does, and so the parity between the two has something to be tested against.
 *
 * Returns null for a missing README — the same "no signal" answer the old
 * `readme_content == null` branch gave.
 */
export function readmeLengthOf(content: string | null | undefined): number | null {
  if (content == null) return null;
  return content.trim().length;
}

/** Minimum number of quality signals required (of 5, see below) to be indexable. */
const MIN_SIGNALS = 3;

/**
 * Returns true if `server` clears the quality bar to be indexed and listed
 * in the sitemap. Two independent gates:
 *
 * 1. Hard exclusion — deprecated or GitHub-archived servers are never
 *    indexable, regardless of signal count.
 * 2. Signal count — needs >= MIN_SIGNALS of the 5 source-data signals below.
 *
 * Signals (each worth 1 point toward MIN_SIGNALS):
 *   1. README present and substantial (readme_length >= README_MIN_LENGTH;
 *      the value is already the TRIMMED character count — see readmeLengthOf)
 *   2. Has at least one tool (has_tools flag, or tool_count > 0 as a
 *      belt-and-suspenders check in case the two ever disagree)
 *   3. Install command derivable (package_name AND package_type both present)
 *   4. GitHub signal present (github_stars > 0 — the column defaults to 0,
 *      so a literal 0 carries no signal)
 *   5. Has a category assigned
 *
 * Extension point for Slice 3 (AI-generated summary, migration 006): add a
 * 6th signal here, e.g. `server.ai_summary != null && server.ai_summary.trim().length > 0`,
 * and bump MIN_SIGNALS's effective denominator if the bar should move from
 * "3 of 5" to "3 of 6" (not implemented yet — do not depend on this signal
 * until that column exists).
 */
export function isIndexable(server: IndexableServerInput): boolean {
  if (server.registry_status === 'deprecated') return false;
  if (server.github_archived) return false;

  let signals = 0;

  if (server.readme_length !== null && server.readme_length >= README_MIN_LENGTH) {
    signals++;
  }

  if (server.has_tools || server.tool_count > 0) {
    signals++;
  }

  if (server.package_name && server.package_type) {
    signals++;
  }

  if (server.github_stars > 0) {
    signals++;
  }

  if (server.category) {
    signals++;
  }

  return signals >= MIN_SIGNALS;
}
