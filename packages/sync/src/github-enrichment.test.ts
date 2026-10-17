/**
 * github-enrichment.test.ts
 *
 * Covers the two defects that made a five-month total outage look healthy:
 *
 *   1. A 401 was a console.warn + continue that pushed nothing to `errors`,
 *      so the pipeline closed sync_log as 'completed' while every single call
 *      failed. Nothing anywhere went red between 2026-03-26 and 2026-08.
 *   2. `updated_at = now()` was written on every pass regardless of whether
 *      the fetched payload had changed — which would have flipped all 452
 *      indexable sitemap URLs to a fresh date simultaneously, with zero real
 *      content change, the moment the token was rotated.
 *
 * Plus the selector fix: an explicit ORDER BY and LIMIT, replacing an
 * unbounded query that PostgREST silently truncated to one arbitrary,
 * never-rotating 1,000-row slice of ~20,506 candidates.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { enrichWithGitHub } from './github-enrichment';

interface Candidate {
  id: string;
  github_url: string;
}

interface SupabaseHarness {
  updates: Record<string, unknown>[];
  selectorCalls: { orders: [string, unknown][]; limit: number | null };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any;
}

function makeSupabase(opts: {
  candidates: Candidate[];
  stored: Record<string, unknown> | null;
  hasCheckedAt?: boolean;
  readError?: unknown;
  updateError?: unknown;
  markCheckedError?: unknown;
}): SupabaseHarness {
  const updates: Record<string, unknown>[] = [];
  const selectorCalls: { orders: [string, unknown][]; limit: number | null } = {
    orders: [],
    limit: null,
  };

  const client = {
    from: () => {
      let mode: 'probe' | 'candidates' | 'stored' | 'update' = 'candidates';
      let payload: Record<string, unknown> | null = null;
      let updateKind: 'markChecked' | 'server' = 'server';

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chain: any = {
        select: (cols: string) => {
          if (cols === 'github_checked_at') mode = 'probe';
          else if (cols.includes('readme_content')) mode = 'stored';
          else mode = 'candidates';
          return chain;
        },
        update: (p: Record<string, unknown>) => {
          payload = p;
          mode = 'update';
          return chain;
        },
        not: () => chain,
        or: () => chain,
        eq: () => {
          if (mode === 'update') updateKind = 'server';
          return chain;
        },
        in: () => {
          if (mode === 'update') updateKind = 'markChecked';
          return chain;
        },
        order: (col: string, o: unknown) => {
          if (mode === 'candidates') selectorCalls.orders.push([col, o]);
          return chain;
        },
        limit: (n: number) => {
          if (mode === 'candidates') selectorCalls.limit = n;
          return chain;
        },
        maybeSingle: async () => ({ data: opts.stored, error: opts.readError ?? null }),
        then: (resolve: (v: unknown) => void) => {
          if (mode === 'probe') {
            return resolve(
              opts.hasCheckedAt === false ? { error: { message: 'column does not exist' } } : { error: null },
            );
          }
          if (mode === 'update') {
            updates.push(payload!);
            return resolve({
              error: updateKind === 'markChecked' ? opts.markCheckedError ?? null : opts.updateError ?? null,
            });
          }
          return resolve({ data: opts.candidates, error: null });
        },
      };
      return chain;
    },
  };

  return { updates, selectorCalls, client };
}

/** GitHub API stub: repo metadata, README, contributors. */
function stubGithub(opts: {
  status?: number;
  readmeStatus?: number;
  contributorStatus?: number;
  repo?: Record<string, unknown>;
  readme?: string;
}) {
  const repo = opts.repo ?? {
    stargazers_count: 42,
    forks_count: 3,
    open_issues_count: 1,
    pushed_at: '2026-03-25T00:00:00Z',
    license: { spdx_id: 'MIT' },
    language: 'TypeScript',
    archived: false,
  };

  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url.endsWith('/readme')) {
        if (opts.readmeStatus && opts.readmeStatus !== 200) {
          return { ok: false, status: opts.readmeStatus, headers: { get: () => null } };
        }
        return { ok: true, status: 200, headers: { get: () => null }, text: async () => opts.readme ?? 'README body' };
      }
      if (url.includes('/contributors')) {
        if (opts.contributorStatus && opts.contributorStatus !== 200) {
          return { ok: false, status: opts.contributorStatus, headers: { get: () => null } };
        }
        return { ok: true, status: 200, headers: { get: () => null }, json: async () => [{}] };
      }
      if (opts.status && opts.status !== 200) {
        return { ok: false, status: opts.status, headers: { get: () => null } };
      }
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => repo };
    }),
  );
}

async function persistReadme(readme: string): Promise<unknown> {
  stubGithub({ readme });
  const h = makeSupabase({ candidates: [CANDIDATE], stored: null });

  const result = await enrichWithGitHub(h.client, 'token');

  expect(result.fatal).toBe(false);
  expect(h.updates).toHaveLength(1);
  return h.updates[0].readme_content;
}

const CANDIDATE: Candidate = { id: 'acme/thing', github_url: 'https://github.com/acme/thing' };
const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env.GH_ENRICHMENT_RATE_DELAY_MS = '0';
  process.env.GH_ENRICHMENT_RETRY_BASE_MS = '0';
  process.env.GH_ENRICHMENT_RETRY_JITTER_MS = '0';
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('candidate selector — explicit ordering and limit', () => {
  it('issues an ORDER BY and a LIMIT instead of relying on PostgREST truncation', async () => {
    const h = makeSupabase({ candidates: [], stored: null });
    await enrichWithGitHub(h.client, 'token');

    expect(h.selectorCalls.limit).toBeGreaterThan(0);
    expect(h.selectorCalls.orders.length).toBeGreaterThanOrEqual(1);
  });

  it('orders by the rotation cursor ascending, nulls first, with a deterministic tiebreak', async () => {
    const h = makeSupabase({ candidates: [], stored: null });
    await enrichWithGitHub(h.client, 'token');

    const [cursor, tiebreak] = h.selectorCalls.orders;
    expect(cursor?.[0]).toBe('github_checked_at');
    expect(cursor?.[1]).toMatchObject({ ascending: true, nullsFirst: true });
    expect(tiebreak?.[0]).toBe('id');
  });

  it('falls back to updated_at ordering when the cursor column is not migrated yet', async () => {
    const h = makeSupabase({ candidates: [], stored: null, hasCheckedAt: false });
    await enrichWithGitHub(h.client, 'token');

    expect(h.selectorCalls.orders[0]?.[0]).toBe('updated_at');
  });
});

describe('401 handling — the silent five-month failure', () => {
  it('reports fatal and a non-empty errors array instead of warning and continuing', async () => {
    stubGithub({ status: 401 });
    const h = makeSupabase({ candidates: [CANDIDATE], stored: null });

    const result = await enrichWithGitHub(h.client, 'expired-token');

    expect(result.fatal).toBe(true);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toMatch(/401/);
    expect(result.enriched).toBe(0);
  });

  it('aborts the run rather than repeating a doomed call per candidate', async () => {
    stubGithub({ status: 401 });
    const many = Array.from({ length: 5 }, (_, i) => ({
      id: `acme/thing-${i}`,
      github_url: `https://github.com/acme/thing-${i}`,
    }));
    const h = makeSupabase({ candidates: many, stored: null });

    await enrichWithGitHub(h.client, 'expired-token');

    // One repo request, then stop — not five.
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
    expect(h.updates).toHaveLength(0);
  });
});

describe('durable unavailable and transient handling', () => {
  it('advances only github_checked_at for a permanent 404', async () => {
    stubGithub({ status: 404 });
    const h = makeSupabase({ candidates: [CANDIDATE], stored: null });

    const result = await enrichWithGitHub(h.client, 'token');

    expect(result.fatal).toBe(false);
    expect(h.updates).toHaveLength(1);
    expect(h.updates[0]).toEqual({ github_checked_at: expect.any(String) });
    expect(h.updates[0]).not.toHaveProperty('updated_at');
  });

  it('coalesces case and .git variants into one repository fetch', async () => {
    stubGithub({});
    const h = makeSupabase({
      candidates: [
        CANDIDATE,
        { id: 'acme/thing-copy', github_url: 'https://github.com/ACME/THING.git' },
      ],
      stored: null,
    });

    const result = await enrichWithGitHub(h.client, 'token');

    expect(result.enriched).toBe(2);
    // metadata + README + contributors, once per normalized repository
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
    expect(h.updates).toHaveLength(2);
  });

  it('bounds transient retries and fails the stage when they are exhausted', async () => {
    stubGithub({ status: 503 });
    const h = makeSupabase({ candidates: [CANDIDATE], stored: null });

    const result = await enrichWithGitHub(h.client, 'token');

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
    expect(result.fatal).toBe(true);
    expect(result.errors.join('\n')).toMatch(/transiently failed/);
    expect(h.updates).toHaveLength(0);
  });

  it('reports exhausted README transients while preserving the stored README', async () => {
    stubGithub({ readmeStatus: 503 });
    const h = makeSupabase({
      candidates: [CANDIDATE],
      stored: {
        github_stars: 42,
        github_last_push: '2026-03-25T00:00:00Z',
        github_license: 'MIT',
        github_language: 'TypeScript',
        github_contributors: 1,
        readme_content: 'known good README',
      },
    });

    const result = await enrichWithGitHub(h.client, 'token');

    expect(result.fatal).toBe(true);
    expect(result.errors.join('\n')).toMatch(/transiently failed/);
    expect(h.updates[0]).toMatchObject({ readme_content: 'known good README' });
  });

  it('reports exhausted contributor transients and preserves a valid count', async () => {
    stubGithub({ contributorStatus: 429, readme: 'README body' });
    const h = makeSupabase({
      candidates: [CANDIDATE],
      stored: {
        github_stars: 42,
        github_last_push: '2026-03-25T00:00:00Z',
        github_license: 'MIT',
        github_language: 'TypeScript',
        github_contributors: 17,
        readme_content: 'README body',
      },
    });

    const result = await enrichWithGitHub(h.client, 'token');

    expect(result.fatal).toBe(true);
    expect(result.errors.join('\n')).toMatch(/transiently failed/);
    expect(h.updates[0]).toMatchObject({ github_contributors: 17 });
    expect(h.updates[0]).not.toHaveProperty('updated_at');
  });

  it('classifies an exhausted request timeout as transient, not a stage deadline', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new DOMException('timed out', 'TimeoutError')));
    const h = makeSupabase({ candidates: [CANDIDATE], stored: null });

    const result = await enrichWithGitHub(h.client, 'token');

    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(3);
    expect(result.fatal).toBe(true);
    expect(result.errors.join('\n')).toMatch(/transiently failed/);
    expect(result.errors.join('\n')).not.toMatch(/stage deadline/);
  });

  it('treats stage-deadline exhaustion as immediately fatal', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-12T00:00:00Z'));
    process.env.GH_ENRICHMENT_STAGE_TIMEOUT_MS = '1';
    const fetch = vi.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 5));
      throw new DOMException('timed out', 'TimeoutError');
    });
    vi.stubGlobal('fetch', fetch);
    const h = makeSupabase({ candidates: [CANDIDATE], stored: null });

    const pending = enrichWithGitHub(h.client, 'token');
    await vi.runAllTimersAsync();
    const result = await pending;

    expect(result.fatal).toBe(true);
    expect(result.errors.join('\n')).toMatch(/stage deadline exceeded/);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('emits one compact status histogram instead of one warning per missing repo', async () => {
    stubGithub({ status: 404 });
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const h = makeSupabase({ candidates: [CANDIDATE], stored: null });

    await enrichWithGitHub(h.client, 'token');

    expect(log.mock.calls.flat().join('\n')).toContain('unavailable=1');
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('README truncation', () => {
  it('leaves short and exactly 50,000-unit READMEs unchanged', async () => {
    const short = 'overview \ud83d\udcca';
    const exactlyAtLimit = `${'a'.repeat(49_998)}\ud83d\udcca`;

    await expect(persistReadme(short)).resolves.toBe(short);
    await expect(persistReadme(exactlyAtLimit)).resolves.toBe(exactlyAtLimit);
  });

  it('keeps ordinary plain-text truncation unchanged', async () => {
    const plain = 'a'.repeat(50_001);

    await expect(persistReadme(plain)).resolves.toBe('a'.repeat(50_000));
  });

  it('omits a high surrogate at the cutoff only when its low surrogate is next', async () => {
    const splitPair = `${'a'.repeat(49_999)}\ud83d\udcca`;

    await expect(persistReadme(splitPair)).resolves.toBe('a'.repeat(49_999));
  });

  it('retains surrogate pairs adjacent to, but not split by, the cutoff', async () => {
    const pairEndsAtCutoff = `${'a'.repeat(49_998)}\ud83d\udccaz`;
    const pairStartsAfterCutoff = `${'a'.repeat(50_000)}\ud83d\udcca`;

    await expect(persistReadme(pairEndsAtCutoff)).resolves.toBe(
      `${'a'.repeat(49_998)}\ud83d\udcca`,
    );
    await expect(persistReadme(pairStartsAfterCutoff)).resolves.toBe('a'.repeat(50_000));
  });
});

describe('persistence failure diagnostics', () => {
  it('logs an opaque bounded diagnostic for a failed mark_checked batch without changing its counter', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const invalid = { id: 'internal/server-id', github_url: 'not a GitHub URL' };
    const h = makeSupabase({
      candidates: [invalid],
      stored: null,
      markCheckedError: { code: '42501', message: 'permission denied for table servers' },
    });

    const result = await enrichWithGitHub(h.client, 'token');
    const output = log.mock.calls.flat().join('\n');

    expect(result.fatal).toBe(true);
    expect(result.errors).toEqual(['GitHub enrichment could not persist 1 row update(s).']);
    expect(output).toContain('operation=mark_checked');
    expect(output).toContain('db_code=42501');
    expect(output).toContain('db_message=permission_denied');
    expect(output).toMatch(/row_ref=sha256:[a-f0-9]{12}/);
    expect(output).not.toContain(invalid.id);
    expect(h.updates).toHaveLength(1);
  });

  it('logs a select failure with an opaque row ref and preserves the existing fatal count', async () => {
    stubGithub({});
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const h = makeSupabase({
      candidates: [CANDIDATE],
      stored: null,
      readError: { code: 'PGRST116', message: 'The result contains 0 rows' },
    });

    const result = await enrichWithGitHub(h.client, 'token');
    const output = log.mock.calls.flat().join('\n');

    expect(result.fatal).toBe(true);
    expect(result.errors).toEqual(['GitHub enrichment could not persist 1 row update(s).']);
    expect(output).toContain('operation=read_current');
    expect(output).toContain('db_code=PGRST116');
    expect(output).toContain('db_message=database_error');
    expect(output).toMatch(/row_ref=sha256:[a-f0-9]{12}/);
    expect(output).not.toContain(CANDIDATE.id);
    expect(h.updates).toHaveLength(0);
  });

  it('logs only fixed categories for an update failure, never error text or sensitive row material', async () => {
    stubGithub({});
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const secret = 'Bearer secret-value';
    const h = makeSupabase({
      candidates: [CANDIDATE],
      stored: null,
      updateError: {
        code: 'UNTRUSTED_CODE',
        message: `UPDATE servers SET authorization='${secret}' WHERE id='${CANDIDATE.id}' https://db.example.test`,
      },
    });

    const result = await enrichWithGitHub(h.client, 'token');
    const output = log.mock.calls.flat().join('\n');

    expect(result.fatal).toBe(true);
    expect(result.errors).toEqual(['GitHub enrichment could not persist 1 row update(s).']);
    expect(output).toContain('operation=update_enrichment');
    expect(output).toContain('db_code=other');
    expect(output).toContain('db_message=database_error');
    expect(output).toMatch(/row_ref=sha256:[a-f0-9]{12}/);
    expect(output).not.toContain(CANDIDATE.id);
    expect(output).not.toContain(secret);
    expect(output).not.toContain('UPDATE servers');
    expect(output).not.toContain('https://db.example.test');
    expect(output.length).toBeLessThan(220); // Fixed fields keep diagnostics bounded.
    expect(h.updates).toHaveLength(1);
  });
});

describe('content-hash gate on updated_at', () => {
  it('does NOT write updated_at when the rendered content is unchanged', async () => {
    stubGithub({ readme: 'README body' });
    const h = makeSupabase({
      candidates: [CANDIDATE],
      // Stored in Postgres offset form — the gate must normalise before
      // comparing, or every pass would look like a change.
      stored: {
        github_stars: 42,
        github_last_push: '2026-03-25T00:00:00+00:00',
        github_license: 'MIT',
        github_language: 'TypeScript',
        readme_content: 'README body',
      },
    });

    const result = await enrichWithGitHub(h.client, 'token');

    expect(h.updates).toHaveLength(1);
    expect(h.updates[0]).not.toHaveProperty('updated_at');
    expect(result.unchanged).toBe(1);
    expect(result.enriched).toBe(0);
  });

  it('still records that the row was visited, so the next run rotates past it', async () => {
    stubGithub({ readme: 'README body' });
    const h = makeSupabase({
      candidates: [CANDIDATE],
      stored: {
        github_stars: 42,
        github_last_push: '2026-03-25T00:00:00Z',
        github_license: 'MIT',
        github_language: 'TypeScript',
        readme_content: 'README body',
      },
    });

    await enrichWithGitHub(h.client, 'token');

    expect(h.updates[0]).toHaveProperty('github_checked_at');
  });

  it('DOES write updated_at when a rendered field actually changed', async () => {
    stubGithub({ readme: 'README body' });
    const h = makeSupabase({
      candidates: [CANDIDATE],
      stored: {
        github_stars: 7, // was 7, GitHub now reports 42
        github_last_push: '2026-03-25T00:00:00Z',
        github_license: 'MIT',
        github_language: 'TypeScript',
        readme_content: 'README body',
      },
    });

    const result = await enrichWithGitHub(h.client, 'token');

    expect(h.updates[0]).toHaveProperty('updated_at');
    expect(result.enriched).toBe(1);
    expect(result.unchanged).toBe(0);
  });

  it('treats a never-enriched row as changed', async () => {
    stubGithub({});
    const h = makeSupabase({ candidates: [CANDIDATE], stored: null });

    const result = await enrichWithGitHub(h.client, 'token');

    expect(h.updates[0]).toHaveProperty('updated_at');
    expect(result.enriched).toBe(1);
  });
});
