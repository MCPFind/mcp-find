import type { SupabaseClient } from '@supabase/supabase-js';
import type { StagedRecord } from './slug-upsert';

/** Compare only source-owned fields. Visiting a row must not rewrite it or
 * advance its public modification date. Reads fail closed: an unavailable
 * comparison must never turn into an unconditional full-catalogue rewrite.
 * No hash column/migration is needed; each registry page is already bounded.
 */
export async function changedRows<T extends StagedRecord>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>, rows: T[]
): Promise<Array<T & { updated_at: string }>> {
  if (!rows.length) return [];
  const keys = [...new Set(rows.flatMap(row => Object.keys(row)))].filter(
    key => key !== 'last_synced_at' && key !== 'updated_at'
  );
  const existing = new Map<string, Record<string, unknown>>();
  for (let offset = 0; offset < rows.length; offset += 200) {
    const { data, error } = await supabase.from('servers').select(keys.join(','))
      .in('id', rows.slice(offset, offset + 200).map(row => row.id));
    if (error || !data) throw new Error(`Cannot compare sync rows: ${error?.message ?? 'missing data'}`);
    for (const row of data as unknown as Array<Record<string, unknown> & { id: string }>) existing.set(row.id, row);
  }
  return rows.filter(row => {
    const stored = existing.get(row.id);
    return !stored || Object.entries(row).some(([key, value]) =>
      keys.includes(key) && !(
        key.endsWith('_at') && typeof value === 'string' && typeof stored[key] === 'string'
          ? Date.parse(value) === Date.parse(stored[key] as string)
          : JSON.stringify(value) === JSON.stringify(stored[key])
      )
    );
  }).map(row => ({ ...row, updated_at: new Date().toISOString() }));
}
