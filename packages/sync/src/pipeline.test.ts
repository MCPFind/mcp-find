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
  servers_community?: number;
  errors?: string[];
}

const updates: SyncLogUpdate[] = [];

/**
 * When set, the double refuses any UPDATE carrying this column, the way
 * PostgREST does before its migration is applied. Reset per test.
 */
let rejectUnknownColumn: string | null = null;
let rejectAllUpdates = false;

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
        if (rejectAllUpdates || (rejectUnknownColumn && rejectUnknownColumn in payload)) {
          return {
            eq: async () => ({
              error: { message: `Could not find the '${rejectUnknownColumn}' column of 'sync_log'` },
            }),
          };
        }
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
const syncCommunitySubmissions = vi.fn();
const enrichWithGitHub = vi.fn();
const categorizeServers = vi.fn();

vi.mock('./registry-sync', () => ({
  syncFromRegistry: (...args: unknown[]) => syncFromRegistry(...args),
}));
vi.mock('./community-sync', () => ({
  syncCommunitySubmissions: (...args: unknown[]) => syncCommunitySubmissions(...args),
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
  rejectUnknownColumn = null;
  rejectAllUpdates = false;
  syncFromRegistry.mockReset();
  syncCommunitySubmissions.mockReset();
  enrichWithGitHub.mockReset();
  categorizeServers.mockReset();
  // Neutral default: the community stage found nothing to do. Tests that care
  // about it override this.
  syncCommunitySubmissions.mockResolvedValue({
    ingested: 0,
    registryOwned: 0,
    skipped: [],
    errors: [],
    fatal: false,
  });
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

/**
 * The community ingest stage.
 *
 * Merging a submission PR wrote nothing at all until this stage existed, so
 * the counter it produces is the only evidence the directory has that a merged
 * submission actually landed. It has to reach sync_log on every terminal path,
 * and a submission that failed to land has to cost the run its 'completed'.
 */
describe('sync_log — community ingest', () => {
  function healthyRegistryRun() {
    syncFromRegistry.mockResolvedValue(17282);
    enrichWithGitHub.mockResolvedValue({ enriched: 42, unchanged: 9, errors: [], fatal: false });
    categorizeServers.mockResolvedValue(120);
  }

  it('records the community count separately from servers_synced', async () => {
    healthyRegistryRun();
    syncCommunitySubmissions.mockResolvedValue({
      ingested: 3,
      registryOwned: 1,
      skipped: [],
      errors: [],
      fatal: false,
    });

    const { runSyncPipeline } = await import('./pipeline');
    expect(await runSyncPipeline()).toBe(0);

    const update = terminalUpdate();
    expect(update.servers_community).toBe(3);
    // Folding community rows into servers_synced would make a run that
    // ingested a submission indistinguishable from one that ingested none.
    expect(update.servers_synced).toBe(17282);
  });

  it('fails the run when a merged submission did not land', async () => {
    healthyRegistryRun();
    syncCommunitySubmissions.mockResolvedValue({
      ingested: 0,
      registryOwned: 0,
      skipped: [{ id: 'community:acme/mcp', slug: 'acme-mcp', reason: 'slug already claimed' }],
      errors: ['community submission not written: id="community:acme/mcp" slug="acme-mcp"'],
      fatal: true,
    });

    const { runSyncPipeline } = await import('./pipeline');
    expect(await runSyncPipeline()).toBe(1);

    const update = terminalUpdate();
    expect(update.status).toBe('failed');
    expect(update.errors?.join('\n')).toContain('community:acme/mcp');
  });

  it('records the community count on the failure path too', async () => {
    syncFromRegistry.mockResolvedValue(17282);
    syncCommunitySubmissions.mockResolvedValue({
      ingested: 2,
      registryOwned: 0,
      skipped: [],
      errors: [],
      fatal: false,
    });
    enrichWithGitHub.mockResolvedValue({ enriched: 0, unchanged: 0, errors: [], fatal: false });
    categorizeServers.mockRejectedValue(new Error('categorize exploded'));

    const { runSyncPipeline } = await import('./pipeline');
    expect(await runSyncPipeline()).toBe(1);

    const update = terminalUpdate();
    expect(update.status).toBe('failed');
    expect(update.servers_community).toBe(2);
  });

  it('still writes the terminal row when servers_community does not exist yet', async () => {
    // Migration 011 is not applied. Losing one counter is survivable; losing
    // the terminal row is not, because a run stuck at 'running' is invisible
    // to every watchdog that reads status.
    healthyRegistryRun();
    syncCommunitySubmissions.mockResolvedValue({
      ingested: 3,
      registryOwned: 0,
      skipped: [],
      errors: [],
      fatal: false,
    });
    rejectUnknownColumn = 'servers_community';

    const { runSyncPipeline } = await import('./pipeline');
    expect(await runSyncPipeline()).toBe(0);

    const update = terminalUpdate();
    expect(update.status).toBe('completed');
    expect(update.servers_synced).toBe(17282);
    expect(update).not.toHaveProperty('servers_community');
  });
});


describe('independent stages and cache freshness', () => {
  it('finishes downstream stages and revalidates successful changes after registry failure', async () => {
    syncFromRegistry.mockImplementation(async (_db, options) => {
      options.onProgress(10);
      throw new Error('registry unavailable');
    });
    syncCommunitySubmissions.mockResolvedValue({ ingested: 2, registryOwned: 0, skipped: [], errors: [], fatal: false });
    enrichWithGitHub.mockResolvedValue({ enriched: 3, unchanged: 0, errors: [], fatal: false });
    categorizeServers.mockResolvedValue(4);
    process.env.REVALIDATE_TOKEN = 'test-token';
    const fetch = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetch);
    try {
      const { runSyncPipeline } = await import('./pipeline');
      expect(await runSyncPipeline()).toBe(1);
      expect(syncCommunitySubmissions).toHaveBeenCalledTimes(1);
      expect(enrichWithGitHub).toHaveBeenCalledTimes(1);
      expect(categorizeServers).toHaveBeenCalledTimes(1);
      expect(terminalUpdate()).toMatchObject({ servers_synced: 10, servers_community: 2, servers_enriched: 3, status: 'failed' });
      expect(fetch).toHaveBeenCalledTimes(1);
    } finally { vi.unstubAllGlobals(); }
  });
  it('does not invalidate caches when no stage changed data', async () => {
    syncFromRegistry.mockResolvedValue(0);
    enrichWithGitHub.mockResolvedValue({ enriched: 0, unchanged: 5, errors: [], fatal: false });
    categorizeServers.mockResolvedValue(0);
    process.env.REVALIDATE_TOKEN = 'test-token';
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    try {
      const { runSyncPipeline } = await import('./pipeline');
      expect(await runSyncPipeline()).toBe(0);
      expect(fetch).not.toHaveBeenCalled();
    } finally { vi.unstubAllGlobals(); }
  });
});


it('rejects a run when both terminal log writes fail rather than claiming completion', async () => {
  syncFromRegistry.mockResolvedValue(1);
  enrichWithGitHub.mockResolvedValue({ enriched: 0, unchanged: 0, errors: [], fatal: false });
  categorizeServers.mockResolvedValue(0);
  rejectAllUpdates = true;
  const { runSyncPipeline } = await import('./pipeline');
  await expect(runSyncPipeline()).rejects.toThrow('sync_log terminal UPDATE failed');
});
