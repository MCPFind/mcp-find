/**
 * The sync pipeline itself, kept apart from the process entry point
 * (index.ts) so it can be exercised by tests without a live database, a live
 * registry, or a process.exit() in the middle of an assertion.
 *
 * runSyncPipeline RETURNS an exit code rather than calling process.exit();
 * index.ts is the one place that turns that code into a process exit.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { syncFromRegistry } from './registry-sync';
import { syncCommunitySubmissions } from './community-sync';
import { enrichWithGitHub } from './github-enrichment';
import { categorizeServers } from './categorizer';

/** The columns every terminal sync_log UPDATE carries. */
interface SyncLogUpdate {
  status: string;
  completed_at: string;
  servers_synced: number;
  servers_enriched: number;
  errors: string[];
}

/**
 * Write the terminal sync_log row, including the community count when the
 * column exists.
 *
 * `servers_community` arrives in migration 011. Until that migration is
 * applied, including the column would make PostgREST reject the whole UPDATE —
 * and losing the terminal row is far worse than losing one counter, because a
 * run stuck at status 'running' is invisible to every watchdog that reads
 * status. So the write degrades: full payload first, and on refusal a retry
 * without the new column plus a loud warning naming the migration. Same shape
 * as the backfill_canonical_slug guard in registry-sync.ts.
 */
async function writeSyncLog(
  supabase: SupabaseClient<any, any, any>, // eslint-disable-line @typescript-eslint/no-explicit-any
  logId: number,
  payload: SyncLogUpdate,
  communitySynced: number
): Promise<void> {
  const { error } = await supabase
    .from('sync_log')
    .update({ ...payload, servers_community: communitySynced })
    .eq('id', logId);

  if (!error) return;

  console.warn(
    `[Sync Pipeline] sync_log UPDATE including servers_community failed (${error.message}); ` +
      `retrying without it. Apply migration 011_sync_log_community_count.sql to record the ` +
      `community count — ${communitySynced} community row(s) this run are otherwise only in the log above.`
  );

  const { error: fallbackError } = await supabase.from('sync_log').update(payload).eq('id', logId);
  if (fallbackError) {
    throw new Error(`sync_log terminal UPDATE failed: ${fallbackError.message}`);
  }
}

/** POST to the site's /api/revalidate endpoint so the cached server count
 *  refreshes immediately after a sync. Non-fatal — a failure here should never
 *  block the sync pipeline from completing successfully.
 */
async function triggerSiteRevalidation(): Promise<void> {
  const siteUrl = process.env.SITE_URL || 'https://mcpfind.org';
  const token = process.env.REVALIDATE_TOKEN;
  if (!token) {
    console.warn('[Revalidate] Skipped — REVALIDATE_TOKEN not set');
    return;
  }
  try {
    const res = await fetch(`${siteUrl}/api/revalidate`, {
      method: 'POST',
      headers: { 'x-revalidate-token': token },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '(unreadable)');
      console.warn(`[Revalidate] Non-OK response ${res.status}: ${body}`);
    } else {
      console.log('[Revalidate] Site cache refreshed successfully');
    }
  } catch (err) {
    // Non-fatal: network failure, timeout, or site down
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[Revalidate] Failed (non-fatal): ${msg}`);
  }
}

export async function runSyncPipeline(): Promise<number> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const githubToken = process.env.GH_ENRICHMENT_TOKEN;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return 1;
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Create sync log entry
  const { data: log, error: logError } = await supabase
    .from('sync_log')
    .insert({ status: 'running' })
    .select()
    .single();

  if (logError || !log) {
    console.error('Failed to create sync log:', logError?.message);
    return 1;
  }

  console.log(`[Sync Pipeline] Started (log id: ${log.id})`);
  const errors: string[] = [];

  // Set when a stage fails in a way that invalidates its output. The run
  // still finishes the independent stages below it, but it may NOT be
  // recorded as 'completed'.
  //
  // This flag is the whole reason the enrichment stage now returns a result
  // object instead of a bare count. From 2026-03-26 the GitHub token 401'd
  // on every single call; enrichment logged a warning per repo, returned 0,
  // and this function closed sync_log as 'completed' with an empty errors
  // array. Five months of total enrichment failure looked identical to five
  // months of healthy runs from every dashboard and watchdog we have.
  let stageFailed = false;

  // Declared out here, not inside the try, because a failed run has to be
  // able to say what it accomplished before it failed.
  //
  // The 2026-09-05 run wrote 17,282 rows and then recorded servers_synced: 0,
  // because these counters lived inside the try and the catch block's
  // sync_log UPDATE only carried status, completed_at and errors. Every
  // column describing the work kept its schema default. A partial run was
  // therefore indistinguishable from a run that did nothing — the same shape
  // of lie as the 401 that made five months of dead enrichment look healthy.
  //
  // Now that enrichment failures are loud and expected, partial runs are the
  // normal case, so they have to be legible.
  let synced = 0;
  let communitySynced = 0;
  let enriched = 0;
  let categorized = 0;

  // Each stage can make useful progress against the existing catalogue even
  // when upstream registry pagination fails. All failures remain visible.
  const stage = async (name: string, run: () => Promise<void>) => {
    try {
      await run();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(message);
      stageFailed = true;
      console.error(`[${name}] Failed: ${message}`);
    }
  };

  await stage('Registry', async () => {
    synced = await syncFromRegistry(supabase, {
      onProgress: total => { synced = total; },
      onIssue: message => { errors.push(message); stageFailed = true; },
    });
  });
  await stage('Community', async () => {
    const result = await syncCommunitySubmissions(supabase);
    communitySynced = result.ingested;
    errors.push(...result.errors);
    stageFailed ||= result.fatal;
  });
  await stage('GitHub', async () => {
    if (!githubToken) throw new Error('GitHub enrichment skipped: no enrichment token configured');
    const result = await enrichWithGitHub(supabase, githubToken);
    enriched = result.enriched;
    errors.push(...result.errors);
    stageFailed ||= result.fatal;
  });
  await stage('Categorization', async () => {
    categorized = await categorizeServers(supabase, total => { categorized = total; });
  });

  await writeSyncLog(supabase, log.id, {
    status: stageFailed ? 'failed' : 'completed',
    completed_at: new Date().toISOString(),
    servers_synced: synced,
    servers_enriched: enriched,
    errors,
  }, communitySynced);

  // Successful writes remain real even in a failed run. The Actions workflow
  // performs targeted slug revalidation after either outcome; this optional
  // local-run hook refreshes directory aggregate caches.
  if (synced + communitySynced + enriched + categorized > 0) await triggerSiteRevalidation();
  console.log(`[Sync Pipeline] ${stageFailed ? 'FAILED (partial)' : 'Complete'} — ` +
    `${synced} registry changed, ${communitySynced} community changed, ` +
    `${enriched} enriched, ${categorized} categorized; ${errors.length} error(s)`);
  return stageFailed ? 1 : 0;
}
