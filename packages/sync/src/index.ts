import { createClient } from '@supabase/supabase-js';
import { syncFromRegistry } from './registry-sync';
import { enrichWithGitHub } from './github-enrichment';
import { categorizeServers } from './categorizer';

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

  try {
    // Stage 1: Registry Sync
    console.log('[Stage 1] Syncing from registry...');
    const synced = await syncFromRegistry(supabase);
    console.log(`[Stage 1] Synced ${synced} servers`);

    // Stage 2: GitHub Enrichment
    let enriched = 0;
    if (githubToken) {
      console.log('[Stage 2] Enriching with GitHub data...');
      enriched = await enrichWithGitHub(supabase, githubToken);
      console.log(`[Stage 2] Enriched ${enriched} servers`);
    } else {
      console.warn('[Stage 2] Skipped — no GH_ENRICHMENT_TOKEN set');
      errors.push('GitHub enrichment skipped: no GH_ENRICHMENT_TOKEN');
    }

    // Stage 3: Categorization
    console.log('[Stage 3] Categorizing servers...');
    const categorized = await categorizeServers(supabase);
    console.log(`[Stage 3] Categorized ${categorized} servers`);

    // Update sync log
    await supabase
      .from('sync_log')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        servers_synced: synced,
        servers_enriched: enriched,
        errors,
      })
      .eq('id', log.id);

    console.log(`[Sync Pipeline] Complete — ${synced} synced, ${enriched} enriched, ${categorized} categorized`);
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
