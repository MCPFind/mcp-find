import { describe, expect, it } from 'vitest';
import { ensureSyncLogTerminal } from './terminal-ledger';

function harness(initialStatus: 'running' | 'completed' | 'failed') {
  const row = { id: 42, status: initialStatus as string, errors: [] as string[] };
  let updates = 0;
  const client = {
    from: () => {
      let mode: 'find' | 'verify' | 'update' = 'find';
      let payload: Record<string, unknown> = {};
      const chain = {
        select: () => chain,
        gte: () => chain,
        order: () => chain,
        limit: () => chain,
        update: (next: Record<string, unknown>) => { mode = 'update'; payload = next; return chain; },
        eq: (column: string) => { if (column === 'id' && mode !== 'update') mode = 'verify'; return chain; },
        maybeSingle: async () => ({ data: { ...row }, error: null }),
        single: async () => ({ data: { id: row.id, status: row.status }, error: null }),
        then: (resolve: (value: unknown) => void) => {
          if (mode === 'update') {
            updates++;
            Object.assign(row, payload);
          }
          return resolve({ error: null });
        },
      };
      return chain;
    },
  };
  return { client, row, updates: () => updates };
}

describe('sync terminal ledger guard', () => {
  it('repairs an orphaned running row and verifies the terminal state', async () => {
    const h = harness('running');
    const result = await ensureSyncLogTerminal(h.client as never, '2026-09-12T10:00:00Z');
    expect(result).toMatchObject({ id: 42, status: 'failed', repaired: true });
    expect(h.row.errors.join('\n')).toContain('process exited');
    expect(h.updates()).toBe(1);
  });

  it('is idempotent for an already-terminal row', async () => {
    const h = harness('completed');
    const result = await ensureSyncLogTerminal(h.client as never, '2026-09-12T10:00:00Z');
    expect(result).toMatchObject({ status: 'completed', repaired: false });
    expect(h.updates()).toBe(0);
  });
});
