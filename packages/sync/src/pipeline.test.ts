/**
 * pipeline.test.ts
 *
 * What a failed sync run is allowed to forget.
 *
 * The run of 2026-09-05 wrote 17,282 rows and then recorded
 * servers_synced: 0 in sync_log, because the counters were only included in
 * the sync_log UPDATE on the success path. The catch block wrote status,
 * completed_at and errors, and nothing else — so every column that says what
 * the run actually accomplished kept its schema default of 0.
 *
 * That was survivable while failures were rare. It is not survivable now:
 * enrichment failures are loud and expected, so partial runs are the normal
 * case, and a partial run that reports zero work is indistinguishable from a
 * run that did nothing at all. Same class of lie as the 401 that reported
 * five months of total enrichment failure as five months of healthy runs.
 *
 * These tests pin the counters onto every terminal path:
 *   - stage failure (enrichment fatal, pipeline continues then fails)
 *   - thrown exception mid-pipeline
 *   - a throw from INSIDE the registry stage, where the count lives in a
 *     local variable the stage never gets to return
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface SyncLogUpdate {
  status?: string;
  completed_at?: string;
  servers_synced?: number;
  servers_enriched?: number;
  errors?: string[];
}

const updates: SyncLogUpdate[] = [];

/** Minimal Supabase double: records every sync_log UPDATE payload. */
function makeSupabase() {
  return {
    from: (_table: string) => ({
      insert: () => ({
        select: () => ({
          single: async () => ({ data: { id: 42 }, error: null }),
        }),
      }),
      update: (payload: SyncLogUpdate) => {
        updates.push(payload);
        return { eq: async () => ({ error: null }) };
      },
    }),
  };
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: () => makeSupabase(),
}));

const syncFromRegistry = vi.fn();
const enrichWithGitHub = vi.fn();
const categorizeServers = vi.fn();

vi.mock('./registry-sync', () => ({
  syncFromRegistry: (...args: unknown[]) => syncFromRegistry(...args),
}));
vi.mock('./github-enrichment', () => ({
  enrichWithGitHub: (...args: unknown[]) => enrichWithGitHub(...args),
}));
vi.mock('./categorizer', () => ({
  categorizeServers: (...args: unknown[]) => categorizeServers(...args),
}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  updates.length = 0;
  syncFromRegistry.mockReset();
  enrichWithGitHub.mockReset();
  categorizeServers.mockReset();
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-double';
  process.env.GH_ENRICHMENT_TOKEN = 'gh-token-double';
  delete process.env.REVALIDATE_TOKEN;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.restoreAllMocks();
});

/** The single terminal sync_log UPDATE a run performs. */
function terminalUpdate(): SyncLogUpdate {
  expect(updates.length).toBeGreaterThan(0);
  return updates[updates.length - 1]!;
}

describe('sync_log — a failed run reports the work it actually did', () => {
  it('records servers_synced on the stage-failure path', async () => {
    syncFromRegistry.mockResolvedValue(17282);
    enrichWithGitHub.mockResolvedValue({
      enriched: 0,
      unchanged: 0,
      errors: ['GitHub API 401 Unauthorized'],
      fatal: true,
    });
    categorizeServers.mockResolvedValue(120);

    const { runSyncPipeline } = await import('./pipeline');
    const code = await runSyncPipeline();

    expect(code).toBe(1);
    const update = terminalUpdate();
    expect(update.status).toBe('failed');
    expect(update.servers_synced).toBe(17282);
    expect(update.servers_enriched).toBe(0);
  });

  it('records servers_synced when a LATER stage throws', async () => {
    // Registry sync completed 17,282 rows; categorization then blew up. The
    // run failed, but 17,282 rows really were written and the log has to say
    // so — writing 0 here is the bug this test exists for.
    syncFromRegistry.mockResolvedValue(17282);
    enrichWithGitHub.mockResolvedValue({
      enriched: 31,
      unchanged: 4,
      errors: [],
      fatal: false,
    });
    categorizeServers.mockRejectedValue(new Error('categorize exploded'));

    const { runSyncPipeline } = await import('./pipeline');
    const code = await runSyncPipeline();

    expect(code).toBe(1);
    const update = terminalUpdate();
    expect(update.status).toBe('failed');
    expect(update.errors).toContain('categorize exploded');
    expect(update.servers_synced).toBe(17282);
    expect(update.servers_enriched).toBe(31);
  });

  it('records the partial count when the registry stage itself throws', async () => {
    // The count lives inside syncFromRegistry, so a throw mid-pagination used
    // to lose it entirely — the stage never returns, and the caller has no
    // number to record. The stage reports progress per batch instead.
    syncFromRegistry.mockImplementation(
      async (_supabase: unknown, options?: { onProgress?: (n: number) => void }) => {
        options?.onProgress?.(500);
        options?.onProgress?.(1000);
        throw new Error('Registry API error: 502');
      }
    );

    const { runSyncPipeline } = await import('./pipeline');
    const code = await runSyncPipeline();

    expect(code).toBe(1);
    const update = terminalUpdate();
    expect(update.status).toBe('failed');
    expect(update.errors).toContain('Registry API error: 502');
    expect(update.servers_synced).toBe(1000);
  });

  it('still records the counters on the success path', async () => {
    syncFromRegistry.mockResolvedValue(17282);
    enrichWithGitHub.mockResolvedValue({
      enriched: 42,
      unchanged: 9,
      errors: [],
      fatal: false,
    });
    categorizeServers.mockResolvedValue(120);

    const { runSyncPipeline } = await import('./pipeline');
    const code = await runSyncPipeline();

    expect(code).toBe(0);
    const update = terminalUpdate();
    expect(update.status).toBe('completed');
    expect(update.servers_synced).toBe(17282);
    expect(update.servers_enriched).toBe(42);
  });
});
