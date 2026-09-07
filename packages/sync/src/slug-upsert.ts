/**
 * Slug minting, run-wide slug arbitration, and batch upsert that survives a
 * constraint violation.
 *
 * Extracted from registry-sync.ts (commit 9947d94) so the community ingest can
 * REUSE it rather than fork it. The rules encoded here are not registry-
 * specific — they are properties of the `servers` table:
 *
 *   - `servers.slug` is UNIQUE, so two rows can never share one.
 *   - PostgREST upserts resolve on `id`, so a slug held by a DIFFERENT id is
 *     an INSERT that violates servers_slug_key.
 *   - Postgres aborts the ENTIRE statement on that violation, so one bad row
 *     costs every row in the batch.
 *
 * Any writer of that table meets all three. A second copy of this logic would
 * drift, and the failure mode of the drift is rows disappearing quietly, which
 * is the failure mode this code exists to eliminate.
 */
import { SupabaseClient } from '@supabase/supabase-js';

/** Generate a URL-friendly slug from a server name. */
export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
}

/** A record staged for upsert. Structural, so it stays in step with the
 *  literals built by the callers without repeating their 20 fields. */
export interface StagedRecord {
  id: string;
  slug: string;
}

/** A row that reached the database and was refused, or never got to try. */
export interface SkippedRow {
  id: string;
  slug: string;
  reason: string;
}

/**
 * Upserts a batch, and on failure bisects it instead of losing it.
 *
 * `servers.slug` is UNIQUE. An upsert with onConflict 'id' resolves conflicts
 * on the primary key only, so a row whose slug is already held by a DIFFERENT
 * id is an INSERT that violates servers_slug_key -- and Postgres aborts the
 * ENTIRE statement, so one bad row costs all ~100 rows in the batch. That is
 * how the last registry run lost 5 batches, roughly 500 rows, against a single
 * console.error.
 *
 * Slug collisions inside a run are prevented upstream by admitBySlug, but a
 * slug can also be held by a row that is not in this run at all -- a server the
 * registry has since delisted, or a community submission ingested on an earlier
 * night. That collision is invisible from the batch, so the batch has to
 * survive meeting one.
 *
 * Bisecting costs O(k log n) extra requests for k failing rows, and only when
 * something actually fails. Every row that genuinely cannot be written is
 * named, with its slug and the database's own message.
 */
export async function upsertBatchWithBisect(
  supabase: SupabaseClient<any, any, any>, // eslint-disable-line @typescript-eslint/no-explicit-any
  rows: StagedRecord[],
  skipped: SkippedRow[],
  logPrefix = '[Registry Sync]'
): Promise<number> {
  if (rows.length === 0) return 0;

  const { error } = await supabase.from('servers').upsert(rows, { onConflict: 'id' });
  if (!error) return rows.length;

  if (rows.length === 1) {
    const row = rows[0]!;
    skipped.push({ id: row.id, slug: row.slug, reason: error.message });
    console.error(
      `${logPrefix} SKIPPED row id="${row.id}" slug="${row.slug}" — ${error.message}`
    );
    return 0;
  }

  const mid = Math.floor(rows.length / 2);
  const left = await upsertBatchWithBisect(supabase, rows.slice(0, mid), skipped, logPrefix);
  const right = await upsertBatchWithBisect(supabase, rows.slice(mid), skipped, logPrefix);
  return left + right;
}

/**
 * Decide which of these records may keep its slug, run-wide.
 *
 * `slugOwner` is the run's ledger of slug -> winning id and is MUTATED here, so
 * passing the same map across batches makes the arbitration run-wide rather
 * than per-batch. Losers go to `skipped` and are logged; they are never given a
 * suffixed slug of their own.
 *
 * Measured against the live registry over 13,261 distinct names, three pairs
 * collapse onto one slug -- io.github.ClockNext/mcp and io.github.Clocknext/mcp,
 * io.github.LocalSynapse/{LocalSynapse,localsynapse}-mcp,
 * io.github.Zuga-luga/{Zugabot,zugabot} -- and each pair arrives inside a
 * SINGLE page, because the registry orders by name and case variants sort
 * adjacently. Deduping on id alone let both through, the upsert tried to INSERT
 * two rows with one slug, and Postgres discarded the batch.
 *
 * Sorted by id first so the winner is a property of the data, not of the order
 * the source happened to return it in: the lexicographically smallest id keeps
 * the slug. Across batches the earlier batch keeps it.
 *
 * The loser is skipped rather than suffixed on purpose. These pairs are one
 * project published twice under a typoed name, and minting a second,
 * near-identical page is precisely the thin-content problem isIndexable()
 * exists to undo.
 */
export function admitBySlug<T extends StagedRecord>(
  records: T[],
  slugOwner: Map<string, string>,
  skipped: SkippedRow[],
  logPrefix = '[Registry Sync]'
): T[] {
  const admitted: T[] = [];

  for (const record of [...records].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    const owner = slugOwner.get(record.slug);
    if (owner === undefined || owner === record.id) {
      slugOwner.set(record.slug, record.id);
      admitted.push(record);
      continue;
    }
    skipped.push({
      id: record.id,
      slug: record.slug,
      reason: `slug already claimed by id "${owner}" in this run (case-insensitive slug collision)`,
    });
    console.error(
      `${logPrefix} SKIPPED row id="${record.id}" slug="${record.slug}" — ` +
        `that slug is already held by id "${owner}". Both names slugify identically; ` +
        `only one can exist because servers.slug is UNIQUE.`
    );
  }

  return admitted;
}

/** Report every row this run failed to write, one line each. */
export function reportSkipped(skipped: SkippedRow[], logPrefix = '[Registry Sync]'): void {
  if (skipped.length === 0) return;
  console.error(
    `${logPrefix} ${skipped.length} row(s) were NOT written and are listed above. ` +
      `A skipped row is a server missing from the catalogue until its cause is fixed; ` +
      `it is reported here rather than disappearing into a batch-level error.`
  );
  for (const row of skipped) {
    console.error(`${logPrefix}   skipped id="${row.id}" slug="${row.slug}": ${row.reason}`);
  }
}
