/**
 * Single source of truth for "is this server page worth Google's crawl budget?"
 *
 * Metadata completeness alone does not establish useful content. This gate is
 * a conservative publishing policy, not a diagnosis of Google's indexing
 * decisions, nor a claim that a server's installation has been tested.
 * The sitemap, page metadata and prerender selection share this predicate.
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

/**
 * Require substantive documentation/tool evidence before counting metadata.
 * Preserve the existing three-of-five threshold. Hosted servers can earn it
 * through source documentation, repository interest and a category; lack of a
 * locally generated package command does not make hosted setup unusable.
 */
export function isIndexable(server: IndexableServerInput): boolean {
  if (server.registry_status !== 'active' || server.github_archived) return false;
  const readme = (server.readme_length ?? 0) >= README_MIN_LENGTH;
  if (!readme && server.tool_count <= 0) return false;
  return [
    readme,
    server.has_tools || server.tool_count > 0,
    Boolean(server.package_name?.trim() && server.package_type),
    server.github_stars > 0,
    Boolean(server.category),
  ].filter(Boolean).length >= 3;
}
