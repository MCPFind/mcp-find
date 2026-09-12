import type { SupabaseClient } from '@supabase/supabase-js';

const GUARD_ERROR = 'Workflow guard: sync process exited before writing a terminal ledger status';

/**
 * Verify the run started by this workflow reached a terminal sync_log state.
 * If the process was killed by its shell deadline, close the orphaned row as
 * failed while preserving counters and prior diagnostics. Safe to call more
 * than once: terminal rows are read only.
 */
export async function ensureSyncLogTerminal(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  syncStart: string,
): Promise<{ id: number; status: string; repaired: boolean }> {
  const { data: row, error } = await supabase
    .from('sync_log')
    .select('id,status,errors')
    .gte('started_at', syncStart)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !row) {
    throw new Error(`Sync ledger verification could not find this run: ${error?.message ?? 'no row'}`);
  }

  let repaired = false;
  if (row.status === 'running') {
    const errors = Array.isArray(row.errors) ? row.errors.map(String) : [];
    if (!errors.includes(GUARD_ERROR)) errors.push(GUARD_ERROR);
    const { error: updateError } = await supabase
      .from('sync_log')
      .update({ status: 'failed', completed_at: new Date().toISOString(), errors })
      .eq('id', row.id)
      .eq('status', 'running');
    if (updateError) throw new Error(`Sync ledger repair failed: ${updateError.message}`);
    repaired = true;
  }

  const { data: verified, error: verifyError } = await supabase
    .from('sync_log')
    .select('id,status')
    .eq('id', row.id)
    .single();
  if (verifyError || !verified || !['completed', 'failed'].includes(verified.status)) {
    throw new Error(`Sync ledger is not terminal: ${verifyError?.message ?? verified?.status ?? 'missing'}`);
  }
  return { id: verified.id, status: verified.status, repaired };
}
