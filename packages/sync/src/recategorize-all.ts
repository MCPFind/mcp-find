/**
 * Full re-categorization script — resets ALL servers to NULL and re-runs
 * categorization with the current keyword set.
 *
 * Needed after expanding from 11 to 21 categories: servers previously
 * assigned to old categories (e.g., Sentry stuck in devtools) won't move
 * to new categories (monitoring) unless we reset and re-categorize everything.
 *
 * Includes rollback on failure — saves all server IDs + original categories
 * before resetting, restores them if categorization throws.
 *
 * Usage: npx tsx packages/sync/src/recategorize-all.ts
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { categorizeServers } from './categorizer';

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Save current state for rollback: fetch all servers with their current category
  console.log('Fetching all servers for snapshot...');
  const { data: allServers, error: fetchError } = await supabase
    .from('servers')
    .select('id, category');

  if (fetchError) {
    console.error('Failed to fetch servers:', fetchError.message);
    process.exit(1);
  }

  const servers = allServers || [];
  const snapshot = new Map(servers.map(s => [s.id, s.category]));
  console.log(`Snapshot saved: ${snapshot.size} servers`);

  // Count current distribution
  const catCounts = new Map<string, number>();
  for (const s of servers) {
    const cat = s.category || 'NULL';
    catCounts.set(cat, (catCounts.get(cat) || 0) + 1);
  }
  console.log('\nCurrent distribution:');
  for (const [cat, count] of [...catCounts.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${cat}: ${count}`);
  }

  // Reset ALL servers to NULL
  const serverIds = servers.map(s => s.id);
  console.log(`\nResetting ${serverIds.length} servers to NULL...`);

  // Batch the reset in chunks of 500 to avoid Supabase query size limits
  const BATCH_SIZE = 500;
  for (let i = 0; i < serverIds.length; i += BATCH_SIZE) {
    const batch = serverIds.slice(i, i + BATCH_SIZE);
    const { error: resetError } = await supabase
      .from('servers')
      .update({ category: null })
      .in('id', batch);

    if (resetError) {
      console.error(`Failed to reset batch ${i / BATCH_SIZE + 1}:`, resetError.message);
      console.error('Aborting — some servers may already be NULL. Running rollback...');
      await rollback(supabase, snapshot);
      process.exit(1);
    }
  }

  console.log('All servers reset to NULL. Running categorizer...');

  try {
    const categorized = await categorizeServers(supabase);
    console.log(`\nCategorized ${categorized} of ${serverIds.length} servers.`);

    // Show new distribution
    const { data: updated } = await supabase
      .from('servers')
      .select('id, category');

    const newCounts = new Map<string, number>();
    for (const s of updated || []) {
      const cat = s.category || 'NULL';
      newCounts.set(cat, (newCounts.get(cat) || 0) + 1);
    }
    console.log('\nNew distribution:');
    for (const [cat, count] of [...newCounts.entries()].sort((a, b) => b[1] - a[1])) {
      const oldCount = catCounts.get(cat) || 0;
      const delta = count - oldCount;
      const deltaStr = delta > 0 ? ` (+${delta})` : delta < 0 ? ` (${delta})` : '';
      console.log(`  ${cat}: ${count}${deltaStr}`);
    }

    // Check for any NULL stragglers
    const nullCount = newCounts.get('NULL') || 0;
    if (nullCount > 0) {
      console.warn(`\nWarning: ${nullCount} servers remain uncategorized (NULL).`);
    }
  } catch (err) {
    console.error('Categorization failed, rolling back...', err);
    await rollback(supabase, snapshot);
    process.exit(1);
  }
}

async function rollback(
  supabase: SupabaseClient<any, any, any>,
  snapshot: Map<string, string | null>
) {
  console.log(`Rolling back ${snapshot.size} servers to original categories...`);

  // Group by category for efficient batch updates
  const groups = new Map<string | null, string[]>();
  for (const [id, category] of snapshot) {
    const ids = groups.get(category) || [];
    ids.push(id);
    groups.set(category, ids);
  }

  const BATCH_SIZE = 500;
  let restored = 0;
  for (const [category, ids] of groups) {
    for (let i = 0; i < ids.length; i += BATCH_SIZE) {
      const batch = ids.slice(i, i + BATCH_SIZE);
      const { error } = await supabase
        .from('servers')
        .update({ category })
        .in('id', batch);

      if (error) {
        console.error(`ROLLBACK FAILED for category "${category}" batch ${i / BATCH_SIZE + 1}:`, error.message);
      } else {
        restored += batch.length;
      }
    }
  }

  console.log(`Rolled back ${restored} of ${snapshot.size} servers.`);
  if (restored < snapshot.size) {
    console.error('INCOMPLETE ROLLBACK — some servers may have wrong categories.');
  }
}

main().catch((err) => {
  console.error('Recategorization failed:', err);
  process.exit(1);
});
