import { createHash } from 'node:crypto';
import { SupabaseClient } from '@supabase/supabase-js';
import { GITHUB_API_BASE, GITHUB_RATE_DELAY_MS } from '@mcpfind/shared';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;
const DEFAULT_STAGE_TIMEOUT_MS = 15 * 60_000;
const MAX_RETRIES = 3;

function positiveEnv(name: string, fallback: number, allowZero = false): number {
  const parsed = Number(process.env[name]);
  return Number.isFinite(parsed) && (allowZero ? parsed >= 0 : parsed > 0)
    ? Math.floor(parsed)
    : fallback;
}

function rateDelayMs(): number {
  return positiveEnv('GH_ENRICHMENT_RATE_DELAY_MS', GITHUB_RATE_DELAY_MS, true);
}

function isRateLimited(response: Response): boolean {
  return response.status === 429 || (
    response.status === 403 && (
      response.headers.get('retry-after') !== null ||
      response.headers.get('x-ratelimit-remaining') === '0'
    )
  );
}

function isTransient(response: Response): boolean {
  return isRateLimited(response) || response.status >= 500;
}

function retryDelayMs(response: Response | null, attempt: number): number {
  const retryAfter = response?.headers.get('retry-after');
  const seconds = retryAfter ? Number(retryAfter) : NaN;
  const dateDelay = retryAfter ? Date.parse(retryAfter) - Date.now() : NaN;
  const requested = Number.isFinite(seconds) ? seconds * 1000 : dateDelay;
  const base = positiveEnv('GH_ENRICHMENT_RETRY_BASE_MS', 1_000, true) * (2 ** attempt);
  const jitter = positiveEnv('GH_ENRICHMENT_RETRY_JITTER_MS', 250, true) * Math.random();
  return Math.min(10_000, Math.max(base, Number.isFinite(requested) ? requested : 0) + jitter);
}

class StageDeadlineError extends Error {}

async function fetchGitHub(
  url: string,
  init: RequestInit,
  deadline: number,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new StageDeadlineError('GitHub enrichment stage deadline exceeded');
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(Math.min(
          positiveEnv('GH_ENRICHMENT_REQUEST_TIMEOUT_MS', DEFAULT_REQUEST_TIMEOUT_MS),
          remaining,
        )),
      });
      if (deadline - Date.now() <= 0) {
        await response.body?.cancel();
        throw new StageDeadlineError('GitHub enrichment stage deadline exceeded');
      }
      if (!isTransient(response) || attempt === MAX_RETRIES - 1) return response;
      await response.body?.cancel();
      const delay = Math.min(retryDelayMs(response, attempt), Math.max(0, deadline - Date.now()));
      if (delay > 0) await sleep(delay);
    } catch (error) {
      lastError = error;
      if (error instanceof StageDeadlineError || deadline - Date.now() <= 0) {
        throw new StageDeadlineError('GitHub enrichment stage deadline exceeded');
      }
      if (attempt === MAX_RETRIES - 1) throw error;
      const delay = Math.min(retryDelayMs(null, attempt), Math.max(0, deadline - Date.now()));
      if (delay > 0) await sleep(delay);
    }
  }
  throw lastError instanceof Error ? lastError : new Error('GitHub retry budget exhausted');
}

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

interface StoredContent extends RenderedContent {
  github_contributors?: number | null;
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
 * Share of normalized repositories that may fail transiently before the stage
 * is called a failure. Permanent 404/410 misses are reported separately.
 */
const MAX_FAILURE_RATE = 0.5;

function parseGithubUrl(raw: string): { owner: string; repo: string; key: string } | null {
  try {
    const sshMatch = raw.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i);
    const url = sshMatch ? new URL(`https://github.com/${sshMatch[1]}/${sshMatch[2]}`) :
      new URL(raw.replace(/^git\+/, ''));
    if (!['github.com', 'www.github.com'].includes(url.hostname.toLowerCase())) return null;
    const [owner, rawRepo] = url.pathname.split('/').filter(Boolean);
    const repo = rawRepo?.replace(/\.git$/i, '');
    if (!owner || !repo) return null;
    return { owner, repo, key: `${owner}/${repo}`.toLowerCase() };
  } catch {
    return null;
  }
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
  const deadline = Date.now() + positiveEnv(
    'GH_ENRICHMENT_STAGE_TIMEOUT_MS',
    DEFAULT_STAGE_TIMEOUT_MS,
  );
  let enriched = 0;
  let unchanged = 0;
  let attemptedRepos = 0;
  let successfulRepos = 0;
  let unavailableRepos = 0;
  const transientRepoKeys = new Set<string>();
  let invalidUrls = 0;
  let writeFailures = 0;
  const errors: string[] = [];
  const headers = {
    Authorization: `Bearer ${githubToken}`,
    Accept: 'application/vnd.github.v3+json',
  };

  // A registry can contain many server records for one repository. Fetch each
  // normalized owner/repo once, then apply the result to every associated row.
  const groups = new Map<string, {
    owner: string;
    repo: string;
    servers: Array<{ id: string; github_url: string }>;
  }>();
  const invalidServers: Array<{ id: string; github_url: string }> = [];
  for (const server of servers) {
    const parsed = parseGithubUrl(server.github_url);
    if (!parsed) {
      invalidUrls++;
      invalidServers.push(server);
      continue;
    }
    const group = groups.get(parsed.key);
    if (group) group.servers.push(server);
    else groups.set(parsed.key, { owner: parsed.owner, repo: parsed.repo, servers: [server] });
  }

  const markChecked = async (rows: Array<{ id: string }>): Promise<boolean> => {
    if (!useCheckedAt) return true;
    const now = new Date().toISOString();
    let ok = true;
    for (let offset = 0; offset < rows.length; offset += 100) {
      const batch = rows.slice(offset, offset + 100);
      const { error: updateError } = await supabase
        .from('servers')
        .update({ github_checked_at: now })
        .in('id', batch.map(row => row.id));
      if (updateError) {
        ok = false;
        writeFailures += batch.length;
      }
    }
    return ok;
  };
  await markChecked(invalidServers);

  const throttle = async () => {
    const delay = Math.min(rateDelayMs(), Math.max(0, deadline - Date.now()));
    if (delay > 0) await sleep(delay);
  };

  for (const [groupKey, group] of groups) {
    attemptedRepos++;
    try {
      const repoRes = await fetchGitHub(
        `${GITHUB_API_BASE}/repos/${group.owner}/${group.repo}`,
        { headers },
        deadline,
      );

      // A 401 invalidates the credential for every remaining call.
      if (repoRes.status === 401) {
        const msg =
          'GitHub authentication failed (HTTP 401). The enrichment token is invalid, expired, ' +
          `or revoked; aborting after ${attemptedRepos} of ${groups.size} normalized repositories.`;
        console.error(`[Enrichment] ${msg}`);
        errors.push(msg);
        return { enriched, unchanged, errors, fatal: true };
      }

      // Missing/deleted/private repositories are a durable property of the
      // source row, not a GitHub outage. Advance only the visit cursor so the
      // queue rotates; do not fabricate content freshness via updated_at.
      if (repoRes.status === 404 || repoRes.status === 410) {
        unavailableRepos++;
        await markChecked(group.servers);
        await throttle();
        continue;
      }

      if (!repoRes.ok) {
        transientRepoKeys.add(groupKey);
        await throttle();
        continue;
      }

      successfulRepos++;
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
        const readmeRes = await fetchGitHub(
          `${GITHUB_API_BASE}/repos/${group.owner}/${group.repo}/readme`,
          { headers: { ...headers, Accept: 'application/vnd.github.raw' } },
          deadline,
        );
        if (readmeRes.status === 401) throw new Error('GitHub authentication failed (HTTP 401)');
        if (isTransient(readmeRes)) transientRepoKeys.add(groupKey);
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
      } catch (error) {
        if (error instanceof StageDeadlineError ||
            (error instanceof Error && /authentication failed \(HTTP 401\)/.test(error.message))) throw error;
        transientRepoKeys.add(groupKey);
      }

      // Fetch contributor count
      let contributorCount = 0;
      let contributorFetchOk = false;
      try {
        const contribRes = await fetchGitHub(
          `${GITHUB_API_BASE}/repos/${group.owner}/${group.repo}/contributors?per_page=1`,
          { headers },
          deadline,
        );
        if (contribRes.status === 401) throw new Error('GitHub authentication failed (HTTP 401)');
        if (isTransient(contribRes)) transientRepoKeys.add(groupKey);
        if (contribRes.ok) {
          contributorFetchOk = true;
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
      } catch (error) {
        if (error instanceof StageDeadlineError ||
            (error instanceof Error && /authentication failed \(HTTP 401\)/.test(error.message))) throw error;
        transientRepoKeys.add(groupKey);
      }

      for (const server of group.servers) {
        // Read one small row at a time rather than loading README blobs for the
        // entire candidate set.
        const { data: storedRow, error: readError } = await supabase
          .from('servers')
          .select('github_stars, github_last_push, github_license, github_language, github_contributors, readme_content')
          .eq('id', server.id)
          .maybeSingle();
        if (readError) {
          writeFailures++;
          continue;
        }
        const stored = (storedRow ?? null) as StoredContent | null;
        const nextReadme = readmeFetchOk ? readmeContent : stored?.readme_content ?? null;
        const nextFields = {
          github_stars: repo.stargazers_count || 0,
          github_forks: repo.forks_count || 0,
          github_open_issues: repo.open_issues_count || 0,
          github_last_push: repo.pushed_at || null,
          github_license: repo.license?.spdx_id || null,
          github_language: repo.language || null,
          github_contributors: contributorFetchOk
            ? contributorCount
            : stored?.github_contributors ?? 0,
          github_archived: repo.archived || false,
          readme_content: nextReadme,
        };
        const changed = !stored || renderedContentHash(stored) !== renderedContentHash(nextFields);
        const now = new Date().toISOString();
        const payload: Record<string, unknown> = { ...nextFields };
        if (useCheckedAt) payload.github_checked_at = now;
        if (changed) payload.updated_at = now;
        const { error: updateError } = await supabase.from('servers').update(payload).eq('id', server.id);
        if (updateError) writeFailures++;
        else if (changed) enriched++;
        else unchanged++;
      }
    } catch (err) {
      if (err instanceof StageDeadlineError) {
        const msg = `${err.message} after ${attemptedRepos} of ${groups.size} normalized repositories.`;
        errors.push(msg);
        console.error(`[Enrichment] ${msg}`);
        return { enriched, unchanged, errors, fatal: true };
      }
      if (err instanceof Error && /authentication failed \(HTTP 401\)/.test(err.message)) {
        errors.push(err.message);
        return { enriched, unchanged, errors, fatal: true };
      }
      transientRepoKeys.add(groupKey);
    }

    await throttle();
  }

  console.log(
    `[Enrichment] repos=${groups.size} attempted=${attemptedRepos} ok=${successfulRepos} ` +
    `unavailable=${unavailableRepos} transient_failed=${transientRepoKeys.size} invalid_urls=${invalidUrls} ` +
    `write_failed=${writeFailures}; rows_changed=${enriched} rows_unchanged=${unchanged}`
  );

  // Only transient/system failures indicate an outage. Permanent 404/410
  // source misses remain visible in the histogram but cannot poison every run.
  if (attemptedRepos > 0 && transientRepoKeys.size / attemptedRepos > MAX_FAILURE_RATE) {
    const msg =
      `GitHub enrichment transiently failed on ${transientRepoKeys.size} of ${attemptedRepos} repositories ` +
      `(${Math.round((transientRepoKeys.size / attemptedRepos) * 100)}%), above the ${Math.round(MAX_FAILURE_RATE * 100)}% ceiling. ` +
      'Treating the stage as failed rather than reporting a partial run as complete.';
    console.error(`[Enrichment] ${msg}`);
    errors.push(msg);
    return { enriched, unchanged, errors, fatal: true };
  }

  if (writeFailures > 0) {
    const msg = `GitHub enrichment could not persist ${writeFailures} row update(s).`;
    errors.push(msg);
    return { enriched, unchanged, errors, fatal: true };
  }

  return { enriched, unchanged, errors, fatal: false };
}
