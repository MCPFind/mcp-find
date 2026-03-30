/**
 * One-time migration script to re-categorize servers currently in "other".
 *
 * The categorizer only processes servers where category IS NULL.
 * This script resets "other" servers to NULL, then re-runs categorization
 * with the expanded keyword set. Includes rollback on failure.
 *
 * Usage: npx tsx packages/sync/src/recategorize-other.ts
 */
import { createClient } from '@supabase/supabase-js';
import { categorizeServers } from './categorizer';

async function main() {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // Get IDs of current "other" servers (needed for rollback)
  const { data: otherServers, error: fetchError } = await supabase
    .from('servers')
    .select('id')
    .eq('category', 'other');

  if (fetchError) {
    console.error('Failed to fetch "other" servers:', fetchError.message);
    process.exit(1);
  }

  const serverIds = (otherServers || []).map(s => s.id);
  console.log(`Found ${serverIds.length} servers currently in "other"`);

  if (serverIds.length === 0) {
    console.log('Nothing to recategorize.');
    return;
  }

  // Reset "other" servers to NULL so the categorizer picks them up
  const { error: resetError } = await supabase
    .from('servers')
    .update({ category: null })
    .in('id', serverIds);

  if (resetError) {
    console.error('Failed to reset categories:', resetError.message);
    process.exit(1);
  }

  console.log(`Reset ${serverIds.length} servers to NULL. Running categorizer...`);

  try {
    // Re-categorize with expanded keyword set
    const categorized = await categorizeServers(supabase);
    console.log(`Categorized ${categorized} servers into new categories.`);

    if (categorized < serverIds.length) {
      console.warn(`Warning: only ${categorized} of ${serverIds.length} servers were categorized. Some may have remained NULL or failed.`);
    }

    // Check how many are still "other" or NULL
    const { count: remaining } = await supabase
      .from('servers')
      .select('*', { count: 'exact', head: true })
      .eq('category', 'other');

    const { count: nullCount } = await supabase
      .from('servers')
      .select('*', { count: 'exact', head: true })
      .is('category', null);

    console.log(`${remaining ?? 0} servers in "other", ${nullCount ?? 0} uncategorized (NULL) after recategorization.`);
  } catch (err) {
    // Rollback: restore all reset servers back to "other"
    console.error('Categorization failed, rolling back...', err);
    const { error: rollbackError } = await supabase
      .from('servers')
      .update({ category: 'other' })
      .in('id', serverIds);

    if (rollbackError) {
      console.error('ROLLBACK FAILED — servers may be orphaned with NULL category:', rollbackError.message);
      console.error('Server IDs to manually restore:', serverIds.join(', '));
    } else {
      console.log(`Rolled back ${serverIds.length} servers to "other".`);
    }
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Recategorization failed:', err);
  process.exit(1);
});
