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
    console.error(`[Sync Pipeline] sync_log UPDATE failed outright: ${fallbackError.message}`);
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

  try {
    // Stage 1: Registry Sync
    console.log('[Stage 1] Syncing from registry...');
    // onProgress keeps `synced` current per batch. Without it a throw from
    // inside the stage — a 5xx partway through registry pagination is the
    // likely shape of the 2026-09-05 failure — loses the count entirely,
    // because the running total is a local the stage never returns.
    synced = await syncFromRegistry(supabase, {
      onProgress: total => {
        synced = total;
      },
    });
    console.log(`[Stage 1] Synced ${synced} servers`);

    // Stage 1b: Community submissions.
    //
    // Runs after the registry so the registry-wins arbitration inside the
    // stage is deciding against rows this run has already written, not against
    // yesterday's snapshot. Runs before categorization so a newly ingested
    // community server gets a category on the same night it lands rather than
    // waiting 24 hours.
    console.log('[Stage 1b] Ingesting community submissions...');
    const community = await syncCommunitySubmissions(supabase);
    communitySynced = community.ingested;
    errors.push(...community.errors);
    if (community.fatal) stageFailed = true;
    console.log(
      `[Stage 1b] Ingested ${communitySynced} community server(s) ` +
        `(${community.registryOwned} deferred to the registry, ` +
        `${community.skipped.length} not written, fatal=${community.fatal})`
    );

    // Stage 2: GitHub Enrichment
    if (githubToken) {
      console.log('[Stage 2] Enriching with GitHub data...');
      const result = await enrichWithGitHub(supabase, githubToken);
      enriched = result.enriched;
      errors.push(...result.errors);
      if (result.fatal) stageFailed = true;
      console.log(
        `[Stage 2] Enriched ${enriched} servers (${result.unchanged} unchanged, fatal=${result.fatal})`
      );
    } else {
      console.warn('[Stage 2] Skipped — no enrichment token configured');
      errors.push('GitHub enrichment skipped: no enrichment token configured');
      stageFailed = true;
    }

    // Stage 3: Categorization
    console.log('[Stage 3] Categorizing servers...');
    categorized = await categorizeServers(supabase);
    console.log(`[Stage 3] Categorized ${categorized} servers`);

    // Update sync log first — mark the terminal status before refreshing
    // caches so we never push a revalidation against an unconfirmed state.
    //
    // 'completed' is a claim about the whole pipeline, so a failed stage has
    // to be able to withhold it. Otherwise `errors` is decorative: the row
    // says completed, every watchdog reads status, and nobody reads errors.
    await writeSyncLog(
      supabase,
      log.id,
      {
        status: stageFailed ? 'failed' : 'completed',
        completed_at: new Date().toISOString(),
        servers_synced: synced,
        servers_enriched: enriched,
        errors,
      },
      communitySynced
    );

    if (stageFailed) {
      console.error(
        `[Sync Pipeline] FAILED — ${synced} synced, ${communitySynced} community, ` +
          `${enriched} enriched, ${categorized} categorized; ` +
          `${errors.length} error(s): ${errors.join(' | ')}`
      );
      // Non-zero exit so the scheduler and watchdog see a failure rather than
      // a silent green run.
      return 1;
    }

    console.log(
      `[Sync Pipeline] Complete — ${synced} synced, ${communitySynced} community, ` +
        `${enriched} enriched, ${categorized} categorized`
    );

    // Stage 4: Trigger site revalidation so cached counts refresh immediately.
    // Runs after sync_log is committed so caches are refreshed against confirmed data.
    console.log('[Stage 4] Triggering site cache revalidation...');
    await triggerSiteRevalidation();
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    errors.push(errorMsg);
    console.error(`[Sync Pipeline] Failed:`, errorMsg);

    // Same counters as the success path. A run that died is still a run that
    // did something, and sync_log is the only place that record exists.
    await writeSyncLog(
      supabase,
      log.id,
      {
        status: 'failed',
        completed_at: new Date().toISOString(),
        servers_synced: synced,
        servers_enriched: enriched,
        errors,
      },
      communitySynced
    );

    console.error(
      `[Sync Pipeline] Partial run recorded — ${synced} synced, ${communitySynced} community, ` +
        `${enriched} enriched, ${categorized} categorized before the failure.`
    );

    return 1;
  }

  return 0;
}

