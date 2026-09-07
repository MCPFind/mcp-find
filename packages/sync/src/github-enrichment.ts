import { createHash } from 'node:crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import { GITHUB_API_BASE, GITHUB_RATE_DELAY_MS } from '@mcpfind/shared';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Outcome of one enrichment stage. Returned rather than logged so the caller
 * can put real failures into `sync_log.errors` — see `fatal` below.
 */
export interface EnrichmentResult {
  /** Rows whose rendered content actually changed and were re-stamped. */
  enriched: number;
  /** Rows fetched successfully whose rendered content was byte-identical. */
  unchanged: number;
  errors: string[];
  /**
   * True when the run stopped for a reason that invalidates the whole stage
   * (bad credentials, or a failure rate so high the results are meaningless).
   * The caller MUST NOT close sync_log as 'completed' when this is set.
   */
  fatal: boolean;
}

/** Fields whose value the server detail page actually renders. */
interface RenderedContent {
  github_stars?: number | null;
  github_last_push?: string | null;
  github_license?: string | null;
  github_language?: string | null;
  readme_content?: string | null;
}

/**
 * Postgres and the GitHub API spell the same instant differently
 * ('2026-03-25T00:00:00+00:00' vs '2026-03-25T00:00:00Z'). Comparing the raw
 * strings would report a change on every single pass and quietly defeat the
 * whole content gate, so normalise before hashing.
 */
function normalizeTimestamp(value: string | null | undefined): string | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? value : new Date(ms).toISOString();
}

/**
 * Hash of the fields that actually render on the page.
 *
 * This is the gate on `updated_at`. Before it existed, every enrichment pass
 * wrote `updated_at = now()` on every row it touched whether or not anything
 * had changed — so `updated_at`, and therefore every sitemap `lastmod`,
 * tracked the job schedule instead of reality.
 *
 * That matters most at the moment the 401'd token is finally rotated: without
 * this gate the first successful run would flip all 452 indexable URLs to the
 * same fresh date simultaneously, with zero real content change. A synchronous
 * mass-fabrication like that is a worse signal to a crawler than the honest
 * five-month freeze it would replace.
 *
 * Volatile counters (forks, open issues, contributors) are deliberately NOT
 * hashed. They are still written; they just don't constitute a content change
 * worth telling a crawler about.
 */
function renderedContentHash(fields: RenderedContent): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        fields.github_stars ?? 0,
        normalizeTimestamp(fields.github_last_push),
        fields.github_license ?? null,
        fields.github_language ?? null,
        fields.readme_content ?? null,
      ])
    )
    .digest('hex');
}

/**
 * Share of attempted repos that may fail before the stage is called a
 * failure. A per-repo 404 is routine; two thirds of the run failing is an
 * outage wearing a routine costume — which is precisely how a 401 on every
 * call passed for a successful sync for five months.
 */
const MAX_FAILURE_RATE = 0.5;

function parseGithubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) return null;
  return { owner: match[1]!, repo: match[2]!.replace(/\.git$/, '') };
}

/**
 * How many candidates a single run may claim.
 *
 * This used to be absent, and that was the bug. PostgREST applies its own
 * max-rows cap to an unbounded select — 1,000 here — and with no ORDER BY it
 * hands back whatever 1,000 physical rows the planner reaches first. Out of
 * ~20,506 candidates that is a fixed, arbitrary slice that never rotates: the
 * same 1,000 rows every run, forever, while the remaining ~19,500 are never
 * enriched at all. The high-star indexable head — the rows whose pages we
 * actually want indexed — sat outside that slice.
 *
 * The cap is now explicit rather than inherited from server config, so
 * changing it is a code change with a diff, not a silent truncation.
 */
const DEFAULT_ENRICHMENT_LIMIT = 1000;

const ENRICHMENT_LIMIT_VAR = 'GH_ENRICHMENT_LIMIT';

function enrichmentLimit(): number {
  const raw = process.env[ENRICHMENT_LIMIT_VAR];
  const parsed = raw ? Number(raw) : NaN;
  if (raw && !Number.isFinite(parsed)) {
    console.warn(`[Enrichment] Ignoring non-numeric ${ENRICHMENT_LIMIT_VAR}="${raw}"`);
  }
  return Number.isFinite(parsed) && parsed > 0
    ? Math.floor(parsed)
    : DEFAULT_ENRICHMENT_LIMIT;
}

/**
 * Probes for the `github_checked_at` column (migration 009).
 *
 * That column is the rotation cursor: it records when we last LOOKED at a
 * repo, which is a different fact from `updated_at`, which records when the
 * repo last CHANGED. Conflating the two makes a resumable run impossible —
 * a repo whose content is unchanged must still be marked as visited, or
 * ordering by staleness returns the same rows on every future run.
 *
 * Tolerated as absent so this file is safe to deploy before the migration is
 * applied (the same pattern as the canonical_slug backfill in
 * registry-sync.ts). Without it the run still works, it just cannot rotate
 * past the stalest `updated_at` window.
 */
async function hasCheckedAtColumn(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>
): Promise<boolean> {
  const { error } = await supabase.from('servers').select('github_checked_at').limit(1);
  if (!error) return true;
  console.warn(
    `[Enrichment] github_checked_at unavailable (${error.message}) — ordering by updated_at instead. ` +
      'Apply supabase/migrations/009_github_enrichment_cursor.sql to enable run rotation.'
  );
  return false;
}

export async function enrichWithGitHub(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  githubToken: string
): Promise<EnrichmentResult> {
  const limit = enrichmentLimit();
  const useCheckedAt = await hasCheckedAtColumn(supabase);
  const cursorColumn = useCheckedAt ? 'github_checked_at' : 'updated_at';

  // Fix 3: Only enrich servers not updated in the last 24 hours (staleness filter)
  //
  // The ORDER BY is explicit and load-bearing, not cosmetic. Ordering by the
  // cursor column ascending with nulls first means each run claims the
  // longest-unvisited candidates, so consecutive runs walk the whole
  // candidate set instead of re-processing one arbitrary slice. `id` is a
  // deterministic tiebreak, so rows sharing a cursor value have a stable
  // order and cannot be skipped or repeated across runs.
  const { data: rawServers, error } = await supabase
    .from('servers')
    .select('id, github_url')
    .not('github_url', 'is', null)
    .or('updated_at.lt.' + new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() + ',github_stars.eq.0')
    .order(cursorColumn, { ascending: true, nullsFirst: true })
    .order('id', { ascending: true })
    .limit(limit);

  if (error || !rawServers) {
    const msg = `Enrichment candidate query failed: ${error?.message ?? 'no rows returned'}`;
    console.error(msg);
    return { enriched: 0, unchanged: 0, errors: [msg], fatal: true };
  }

  const servers = rawServers as Array<{ id: string; github_url: string }>;
  console.log(
    `[Enrichment] Claimed ${servers.length} candidates (limit ${limit}, ordered by ${cursorColumn} ASC)`
  );
  let enriched = 0;
  let unchanged = 0;
  let attempted = 0;
  let failed = 0;
  const errors: string[] = [];
  const headers = {
    Authorization: `Bearer ${githubToken}`,
    Accept: 'application/vnd.github.v3+json',
  };

  for (const server of servers) {
    const parsed = parseGithubUrl(server.github_url);
    if (!parsed) continue;

    attempted++;

    try {
      // Fetch repo metadata with retry on rate limit
      let repoRes: Response | null = null;
      const MAX_RETRIES = 3;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        repoRes = await fetch(
          `${GITHUB_API_BASE}/repos/${parsed.owner}/${parsed.repo}`,
          { headers }
        );
        if (repoRes.status === 403) {
          const retryAfter = repoRes.headers.get('retry-after');
          let waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60000;
          waitMs = Math.min(waitMs, 300_000); // Cap at 5 minutes
          console.warn(`Rate limited (attempt ${attempt + 1}/${MAX_RETRIES}), waiting ${waitMs}ms`);
          await sleep(waitMs);
          // retry the same server
        } else {
          break;
        }
      }
      if (!repoRes || repoRes.status === 403) {
        failed++;
        console.warn(`Skipping ${parsed.owner}/${parsed.repo} after ${MAX_RETRIES} rate-limit retries`);
        continue;
      }

      // THE defect behind everything else. A 401 is never a property of one
      // repo — it is the credential, and it will be 401 for every remaining
      // call. This branch used to be a console.warn + continue that pushed
      // nothing to `errors`, so the stage reported enriched=0 and the sync
      // still closed as 'completed'. It did that on every run from
      // 2026-03-26 onward and nothing anywhere went red for five months.
      // Stop the run, and make the caller unable to call it a success.
      if (repoRes.status === 401) {
        const msg =
          `GitHub authentication failed (HTTP 401) on ${parsed.owner}/${parsed.repo}. ` +
          'The enrichment token is invalid, expired, or revoked — every remaining call would fail ' +
          `identically, so the run is aborting after ${attempted} of ${servers.length} candidates. ` +
          'Rotate the enrichment token.';
        console.error(`[Enrichment] ${msg}`);
        errors.push(msg);
        return { enriched, unchanged, errors, fatal: true };
      }

      if (!repoRes.ok) {
        failed++;
        console.warn(`GitHub API ${repoRes.status} for ${parsed.owner}/${parsed.repo}`);
        await sleep(GITHUB_RATE_DELAY_MS);
        continue;
      }

      const repo = await repoRes.json();

      // Fetch README.
      //
      // `readmeFetchOk` distinguishes "this repo has no README" (a real fact,
      // worth storing as null) from "we failed to ask" (not a fact at all).
      // Without that distinction a transient fetch failure would both wipe a
      // good stored README and register as a content change, bumping
      // updated_at — a fabricated freshness signal produced by a network blip.
      let readmeContent: string | null = null;
      let readmeFetchOk = false;
      try {
        const readmeRes = await fetch(
          `${GITHUB_API_BASE}/repos/${parsed.owner}/${parsed.repo}/readme`,
          { headers: { ...headers, Accept: 'application/vnd.github.raw' } }
        );
        if (readmeRes.ok) {
          readmeFetchOk = true;
          readmeContent = await readmeRes.text();
          // Truncate very long READMEs
          if (readmeContent.length > 50000) {
            readmeContent = readmeContent.slice(0, 50000);
          }
        } else if (readmeRes.status === 404) {
          // Definitively no README.
          readmeFetchOk = true;
        }
      } catch {
        // README fetch failed, continue without it
      }

      // Fetch contributor count
      let contributorCount = 0;
      try {
        const contribRes = await fetch(
          `${GITHUB_API_BASE}/repos/${parsed.owner}/${parsed.repo}/contributors?per_page=1`,
          { headers }
        );
        if (contribRes.ok) {
          // Parse Link header for total count
          const linkHeader = contribRes.headers.get('link');
          if (linkHeader) {
            const lastMatch = linkHeader.match(/page=(\d+)>; rel="last"/);
            contributorCount = lastMatch ? parseInt(lastMatch[1]!, 10) : 1;
          } else {
            const contribs = await contribRes.json();
            contributorCount = Array.isArray(contribs) ? contribs.length : 0;
          }
        }
      } catch {
        // Contributor count failed, use 0
      }

      // Read back only this one row's rendered fields — one small row at a
      // time rather than pulling every candidate's readme_content up front,
      // which would put tens of MB of blobs in memory per run.
      const { data: storedRow } = await supabase
        .from('servers')
        .select('github_stars, github_last_push, github_license, github_language, readme_content')
        .eq('id', server.id)
        .maybeSingle();
      const stored = (storedRow ?? null) as RenderedContent | null;

      // If we never got a definitive answer about the README, carry the stored
      // one forward instead of overwriting it with a fetch failure.
      const nextReadme = readmeFetchOk ? readmeContent : stored?.readme_content ?? null;

      const nextFields = {
        github_stars: repo.stargazers_count || 0,
        github_forks: repo.forks_count || 0,
        github_open_issues: repo.open_issues_count || 0,
        github_last_push: repo.pushed_at || null,
        github_license: repo.license?.spdx_id || null,
        github_language: repo.language || null,
        github_contributors: contributorCount,
        github_archived: repo.archived || false,
        readme_content: nextReadme,
      };

      // The gate. updated_at moves only when the rendered content actually
      // differs; a row we merely looked at is marked as visited, not as
      // modified.
      const changed = !stored || renderedContentHash(stored) !== renderedContentHash(nextFields);

      const now = new Date().toISOString();
      const payload: Record<string, unknown> = { ...nextFields };
      if (useCheckedAt) payload.github_checked_at = now;
      if (changed) payload.updated_at = now;

      const { error: updateError } = await supabase
        .from('servers')
        .update(payload)
        .eq('id', server.id);

      if (updateError) {
        failed++;
        console.error(`Failed to update ${server.id}:`, updateError.message);
      } else if (changed) {
        enriched++;
      } else {
        unchanged++;
      }
    } catch (err) {
      failed++;
      console.error(`Error enriching ${server.id}:`, err);
    }

    await sleep(GITHUB_RATE_DELAY_MS);
  }

  console.log(
    `[Enrichment] ${attempted} attempted — ${enriched} changed, ${unchanged} unchanged, ${failed} failed`
  );

  // A high failure rate is an outage, not a tail of odd repos. Surface it so
  // the caller cannot record the run as a clean success.
  if (attempted > 0 && failed / attempted > MAX_FAILURE_RATE) {
    const msg =
      `GitHub enrichment failed on ${failed} of ${attempted} repos ` +
      `(${Math.round((failed / attempted) * 100)}%), above the ${Math.round(MAX_FAILURE_RATE * 100)}% ceiling. ` +
      'Treating the stage as failed rather than reporting a partial run as complete.';
    console.error(`[Enrichment] ${msg}`);
    errors.push(msg);
    return { enriched, unchanged, errors, fatal: true };
  }

  return { enriched, unchanged, errors, fatal: false };
}
