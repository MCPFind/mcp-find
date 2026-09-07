import { createClient } from '@supabase/supabase-js';
import { syncFromRegistry } from './registry-sync';
import { enrichWithGitHub } from './github-enrichment';
import { categorizeServers } from './categorizer';

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

async function runSyncPipeline() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const githubToken = process.env.GH_ENRICHMENT_TOKEN;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
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
    process.exit(1);
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

  try {
    // Stage 1: Registry Sync
    console.log('[Stage 1] Syncing from registry...');
    const synced = await syncFromRegistry(supabase);
    console.log(`[Stage 1] Synced ${synced} servers`);

    // Stage 2: GitHub Enrichment
    let enriched = 0;
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
    const categorized = await categorizeServers(supabase);
    console.log(`[Stage 3] Categorized ${categorized} servers`);

    // Update sync log first — mark the terminal status before refreshing
    // caches so we never push a revalidation against an unconfirmed state.
    //
    // 'completed' is a claim about the whole pipeline, so a failed stage has
    // to be able to withhold it. Otherwise `errors` is decorative: the row
    // says completed, every watchdog reads status, and nobody reads errors.
    await supabase
      .from('sync_log')
      .update({
        status: stageFailed ? 'failed' : 'completed',
        completed_at: new Date().toISOString(),
        servers_synced: synced,
        servers_enriched: enriched,
        errors,
      })
      .eq('id', log.id);

    if (stageFailed) {
      console.error(
        `[Sync Pipeline] FAILED — ${synced} synced, ${enriched} enriched, ${categorized} categorized; ` +
          `${errors.length} error(s): ${errors.join(' | ')}`
      );
      // Non-zero exit so the scheduler and watchdog see a failure rather than
      // a silent green run.
      process.exit(1);
    }

    console.log(`[Sync Pipeline] Complete — ${synced} synced, ${enriched} enriched, ${categorized} categorized`);

    // Stage 4: Trigger site revalidation so cached counts refresh immediately.
    // Runs after sync_log is committed so caches are refreshed against confirmed data.
    console.log('[Stage 4] Triggering site cache revalidation...');
    await triggerSiteRevalidation();
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    errors.push(errorMsg);
    console.error(`[Sync Pipeline] Failed:`, errorMsg);

    await supabase
      .from('sync_log')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        errors,
      })
      .eq('id', log.id);

    process.exit(1);
  }
}

runSyncPipeline();
