#!/usr/bin/env node
/**
 * Read-only parity check for migration 010 (servers.readme_length).
 *
 * WHY THIS EXISTS
 * ---------------
 * isIndexable()'s README signal moved from
 *     trim(readme_content).length >= 400   (computed in JS, per request)
 * to
 *     readme_length >= 400                 (computed once by Postgres)
 *
 * The two are the same expression, but they are evaluated by two different
 * engines. Postgres length() counts CHARACTERS; JavaScript .length counts
 * UTF-16 CODE UNITS, so a character outside the BMP counts 1 in Postgres and
 * 2 in JS. Postgres btrim() with an explicit character set and JS .trim()
 * also disagree about exotic Unicode whitespace. Neither can change a verdict
 * unless a README's trimmed length sits essentially ON the 400 boundary.
 *
 * "Essentially on the boundary" is a claim, not a fact, so this script checks
 * it against the real data instead of asserting it. It reads only the rows
 * that could possibly disagree — those whose readme_length is within
 * +/- BAND of 400 — so it transfers kilobytes, not the ~250 MB a full README
 * scan would cost.
 *
 * It also reports how many active rows score the README signal, which is the
 * input that must not move for the eligible count (478 at the time migration
 * 010 was written) to stay put.
 *
 * RUN IT AFTER APPLYING MIGRATION 010, BEFORE TRUSTING THE NEW COLUMN.
 *
 * Usage:
 *   node scripts/verify-readme-length-parity.mjs
 *   (reads SUPABASE_URL and SUPABASE_ANON_KEY from the process environment)
 *
 * Exit 0 = every row that could disagree agrees. Exit 1 = at least one row
 * disagrees; the offending slugs are printed.
 */

import { createClient } from '@supabase/supabase-js';

const README_MIN_LENGTH = 400;
/** Only rows whose stored length is within this many characters of the
 *  boundary can plausibly disagree. Generous by orders of magnitude for any
 *  realistic encoding or trimming delta at a 400-character threshold. */
const BAND = 100;
const PAGE = 200;

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error('Missing SUPABASE_URL and SUPABASE_ANON_KEY in the process environment.');
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });

/** The exact JS expression the predicate used before migration 010. */
function readmeLengthOf(content) {
  if (content == null) return null;
  return content.trim().length;
}

async function main() {
  // 1. Boundary band — the only rows where the two engines could disagree.
  const disagreements = [];
  let inspected = 0;
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from('servers')
      .select('slug,readme_length,readme_content')
      .not('readme_content', 'is', null)
      .gte('readme_length', README_MIN_LENGTH - BAND)
      .lte('readme_length', README_MIN_LENGTH + BAND)
      .order('slug', { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) {
      console.error('Query failed:', error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    for (const row of data) {
      inspected++;
      const js = readmeLengthOf(row.readme_content);
      const pgSignal = row.readme_length !== null && row.readme_length >= README_MIN_LENGTH;
      const jsSignal = js !== null && js >= README_MIN_LENGTH;
      if (pgSignal !== jsSignal) {
        disagreements.push({ slug: row.slug, pg: row.readme_length, js, pgSignal, jsSignal });
      }
    }
    if (data.length < PAGE) break;
  }

  console.log(
    `Boundary band [${README_MIN_LENGTH - BAND}, ${README_MIN_LENGTH + BAND}]: ` +
      `${inspected} row(s) inspected, ${disagreements.length} disagreement(s).`
  );
  for (const d of disagreements) {
    console.error(
      `  DISAGREE ${d.slug}: postgres readme_length=${d.pg} (signal=${d.pgSignal}), ` +
        `js trim().length=${d.js} (signal=${d.jsSignal})`
    );
  }

  // 2. How many active rows score the README signal at all. A change here is
  //    the same failure the band check catches, reported as a number.
  const { count: pgSignalCount, error: countErr } = await supabase
    .from('servers')
    .select('*', { count: 'exact', head: true })
    .eq('registry_status', 'active')
    .gte('readme_length', README_MIN_LENGTH);
  if (countErr) {
    console.error('Count query failed:', countErr.message);
    process.exit(1);
  }
  console.log(`Active rows scoring the README signal via readme_length: ${pgSignalCount}`);
  console.log(
    'Cross-check the eligible total (expected 478 as of migration 010) against the ' +
      'live sitemap index shard count before and after applying the migration.'
  );

  if (disagreements.length > 0) {
    console.error('\nFAIL: readme_length is NOT a drop-in for trim(readme_content).length.');
    process.exit(1);
  }
  console.log(
    '\nOK: readme_length agrees with trim(readme_content).length on every row that could differ.'
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
