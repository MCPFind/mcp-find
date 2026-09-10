/**
 * registry-sync.test.ts
 *
 * Regression tests for the registry v0.1 field-name fix.
 *
 * The sync read `pkg.name` and `pkg.registry_url`. The live API emits
 * `identifier` and `registryType`. Consequences, both confirmed against
 * production data: `package_name` was NULL on all 27,765 rows, and
 * `package_type` was garbage-populated on 13,068 of them by a name-heuristic
 * fallback that classified any identifier containing a "/" as Docker.
 *
 * Both columns feed isIndexable(), so the whole catalogue lost a quality
 * signal and gained a fake one.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { syncFromRegistry } from './registry-sync';

interface CapturedRecord {
  id: string;
  package_name: string | null;
  package_type: string | null;
  package_url: string | null;
  is_official: boolean;
}

function makeSupabase(captured: CapturedRecord[]) {
  return {
    from: () => ({
      select: () => ({ in: async () => ({ data: [], error: null }) }),
      upsert: async (rows: CapturedRecord[]) => {
        captured.push(...rows);
        return { error: null };
      },
    }),
    rpc: async () => ({ error: null }),
  };
}

function makeRegistryResponse(pkg: Record<string, unknown> | null) {
  return {
    servers: [
      {
        server: {
          name: 'acme.example/thing',
          title: 'Thing',
          description: 'A thing',
          version: '1.0.0',
          repository: { url: 'https://github.com/acme/thing' },
          packages: pkg ? [pkg] : [],
          capabilities: { tools: true },
        },
        _meta: {
          'io.modelcontextprotocol.registry/official': {
            status: 'active',
            updatedAt: '2026-09-05T00:00:00Z',
          },
        },
      },
    ],
    metadata: {},
  };
}

async function runSync(pkg: Record<string, unknown> | null): Promise<CapturedRecord> {
  const captured: CapturedRecord[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => makeRegistryResponse(pkg) })),
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await syncFromRegistry(makeSupabase(captured) as any);
  return captured[0]!;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('registry v0.1 package field names', () => {
  it('reads package_name from `identifier`, not `name`', async () => {
    const record = await runSync({
      identifier: '@acme/mcp-server-thing',
      registryType: 'npm',
      registryBaseUrl: 'https://registry.npmjs.org',
      version: '1.2.3',
    });

    expect(record.package_name).toBe('@acme/mcp-server-thing');
    expect(record.package_name).not.toBeNull();
  });

  it('reads package_url from `registryBaseUrl`, not `registry_url`', async () => {
    const record = await runSync({
      identifier: 'thing',
      registryType: 'pypi',
      registryBaseUrl: 'https://pypi.org',
    });

    expect(record.package_url).toBe('https://pypi.org');
  });

  it('derives package_type from the declared registryType', async () => {
    expect((await runSync({ identifier: 'a', registryType: 'npm' })).package_type).toBe('npm');
    expect((await runSync({ identifier: 'a', registryType: 'pypi' })).package_type).toBe('pypi');
    expect((await runSync({ identifier: 'a', registryType: 'oci' })).package_type).toBe('docker');
    expect((await runSync({ identifier: 'a', registryType: 'nuget' })).package_type).toBe('other');
  });

  it('does NOT classify a slash-containing identifier as docker (the 13,068-row bug)', async () => {
    // The old name-heuristic tier read `name.includes('/') && !startsWith('@')`
    // as evidence of a Docker image. It is evidence of nothing. Exercised via
    // the legacy field, because that is the tier the heuristic sat behind.
    const record = await runSync({ name: 'acme/thing' });
    expect(record.package_type).not.toBe('docker');
    expect(record.package_type).toBe('other');
  });

  it('does NOT classify a scoped identifier as npm on the "@" prefix alone', async () => {
    const record = await runSync({ name: '@acme/thing' });
    expect(record.package_type).not.toBe('npm');
    expect(record.package_type).toBe('other');
  });

  it('reports null package fields when the server declares no package at all', async () => {
    const record = await runSync(null);
    expect(record.package_name).toBeNull();
    expect(record.package_type).toBeNull();
    expect(record.package_url).toBeNull();
  });

  it('still parses a legacy snake_case payload, so a rollback does not blank the columns', async () => {
    const record = await runSync({ name: 'legacy-thing', registry_url: 'https://registry.npmjs.org' });
    expect(record.package_name).toBe('legacy-thing');
    expect(record.package_type).toBe('npm');
    expect(record.package_url).toBe('https://registry.npmjs.org');
  });

  it('recomputes is_official from the now-populated package name', async () => {
    // is_official is derived from package_name, which was NULL everywhere —
    // so this flag was false catalogue-wide too.
    const record = await runSync({ identifier: '@modelcontextprotocol/server-filesystem', registryType: 'npm' });
    expect(record.is_official).toBe(true);
  });
});

/**
 * Duplicate-slug batch loss.
 *
 * Batches were dying on
 *   duplicate key value violates unique constraint "servers_slug_key"
 * and taking every row in the batch with them -- 5 batches, roughly 500 rows,
 * in the last run, reported as one console.error and nothing else. Same silent
 * shape as the enrichment 401.
 *
 * ROOT CAUSE, measured against the live registry (13,261 distinct names
 * scanned): generateSlug() lowercases, and the registry's names are
 * case-sensitive. Three pairs of genuinely distinct registry servers
 * collapse onto one slug:
 *
 *   io.github.ClockNext/mcp            -> io-github-clocknext-mcp
 *   io.github.Clocknext/mcp            -> io-github-clocknext-mcp
 *   io.github.LocalSynapse/LocalSynapse-mcp -> io-github-localsynapse-localsynapse-mcp
 *   io.github.LocalSynapse/localsynapse-mcp -> io-github-localsynapse-localsynapse-mcp
 *   io.github.Zuga-luga/Zugabot        -> io-github-zuga-luga-zugabot
 *   io.github.Zuga-luga/zugabot        -> io-github-zuga-luga-zugabot
 *
 * All three pairs land in the SAME page, because the registry orders by name
 * and case variants sort adjacently. The batch dedupe keyed on `id` only, so
 * both members survived it (their ids differ), and the upsert -- one statement
 * with onConflict 'id' -- tried to INSERT two rows carrying the same slug.
 * Postgres aborted the whole statement, so ~100 rows died for one collision.
 *
 * The fix is two-layered:
 *   1. Dedupe on slug as well as id, deterministically, so the collision never
 *      reaches Postgres. Suffixing the loser to give it its own URL was
 *      rejected: these pairs are the same project published twice under a
 *      typoed name, and minting a near-duplicate page is the exact
 *      thin-content problem isIndexable() exists to undo.
 *   2. Split-and-retry a batch that fails anyway -- a slug held by a row not
 *      present in this run (a delisted server) can still collide -- so a
 *      failure costs the conflicting rows and not the batch.
 *
 * Everything skipped is logged with its id and its slug. Nothing is dropped
 * quietly.
 */

interface UpsertAttempt {
  rows: Array<{ id: string; slug: string }>;
}

/** Supabase double whose upsert enforces the real servers_slug_key constraint. */
function makeSlugConstrainedSupabase(options: { existingSlugs?: string[] } = {}) {
  const written = new Map<string, { id: string; slug: string }>(); // id -> row
  const slugOwners = new Map<string, string>(); // slug -> id
  for (const s of options.existingSlugs ?? []) slugOwners.set(s, `pre-existing:${s}`);
  const attempts: UpsertAttempt[] = [];

  return {
    written,
    attempts,
    client: {
      from: () => ({
        select: () => ({ in: async (_key: string, ids: string[]) => ({ data: ids.map(id => written.get(id)).filter(Boolean), error: null }) }),
        upsert: async (rows: Array<{ id: string; slug: string }>) => {
          attempts.push({ rows });
          // Postgres evaluates the statement atomically: one violation and
          // nothing in the statement lands.
          const staged = new Map(slugOwners);
          for (const r of rows) {
            const owner = staged.get(r.slug);
            if (owner !== undefined && owner !== r.id) {
              return {
                error: {
                  message: `duplicate key value violates unique constraint "servers_slug_key"`,
                },
              };
            }
            staged.set(r.slug, r.id);
          }
          for (const r of rows) {
            written.set(r.id, r);
            slugOwners.set(r.slug, r.id);
          }
          return { error: null };
        },
      }),
      rpc: async () => ({ error: null }),
    },
  };
}

function serverItem(name: string) {
  return {
    server: {
      name,
      title: name,
      description: 'A thing',
      version: '1.0.0',
      repository: { url: 'https://github.com/acme/thing' },
      packages: [{ identifier: '@acme/thing', registryType: 'npm' }],
      capabilities: { tools: true },
    },
    _meta: {
      'io.modelcontextprotocol.registry/official': {
        status: 'active',
        updatedAt: '2026-09-05T00:00:00Z',
      },
    },
  };
}

/** Serves the given pages in order, one per fetch call. */
function stubRegistryPages(pages: string[][]) {
  let call = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const names = pages[call] ?? [];
      const isLast = call >= pages.length - 1;
      call++;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          servers: names.map(serverItem),
          metadata: isLast ? {} : { nextCursor: `cursor-${call}` },
        }),
      };
    })
  );
}

describe('duplicate-slug handling', () => {
  it('does not send two distinct ids sharing one slug to Postgres', async () => {
    // The real ClockNext pair, in the order the registry returns it.
    const db = makeSlugConstrainedSupabase();
    stubRegistryPages([['io.github.ClockNext/mcp', 'io.github.Clocknext/mcp', 'io.github.other/ok']]);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const synced = await syncFromRegistry(db.client as any);

    // The whole batch must survive. Before the fix, the upsert 409'd on the
    // slug and all three rows were lost.
    expect(db.written.has('io.github.other/ok')).toBe(true);
    expect(synced).toBe(2);

    const slugs = [...db.written.values()].map(r => r.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('picks the same winner regardless of the order the registry returns them', async () => {
    const forward = makeSlugConstrainedSupabase();
    stubRegistryPages([['io.github.ClockNext/mcp', 'io.github.Clocknext/mcp']]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await syncFromRegistry(forward.client as any);
    vi.unstubAllGlobals();

    const reversed = makeSlugConstrainedSupabase();
    stubRegistryPages([['io.github.Clocknext/mcp', 'io.github.ClockNext/mcp']]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await syncFromRegistry(reversed.client as any);

    expect([...forward.written.keys()]).toEqual([...reversed.written.keys()]);
  });

  it('logs every skipped row with its id and slug', async () => {
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});

    const db = makeSlugConstrainedSupabase();
    stubRegistryPages([['io.github.ClockNext/mcp', 'io.github.Clocknext/mcp']]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await syncFromRegistry(db.client as any);

    const joined = errors.join('\n');
    expect(joined).toContain('io-github-clocknext-mcp');
    // The id that lost the slug has to be named, or the row is still a
    // silent drop with extra steps.
    const loser = [...db.written.keys()].includes('io.github.ClockNext/mcp')
      ? 'io.github.Clocknext/mcp'
      : 'io.github.ClockNext/mcp';
    expect(joined).toContain(loser);
  });

  it('dedupes on slug across batches, not just within one', async () => {
    const db = makeSlugConstrainedSupabase();
    stubRegistryPages([['io.github.ClockNext/mcp'], ['io.github.Clocknext/mcp']]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const synced = await syncFromRegistry(db.client as any);

    expect(db.written.size).toBe(1);
    expect(synced).toBe(1);
  });

  it('a collision with a row outside this run costs that row, not the batch', async () => {
    // A delisted server still holds the slug in the table, so the collision
    // cannot be seen from the batch. The other 4 rows must still land.
    const db = makeSlugConstrainedSupabase({ existingSlugs: ['io-github-acme-taken'] });
    stubRegistryPages([
      [
        'io.github.acme/a',
        'io.github.acme/b',
        'io.github.acme/taken',
        'io.github.acme/c',
        'io.github.acme/d',
      ],
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const synced = await syncFromRegistry(db.client as any);

    expect(db.written.has('io.github.acme/a')).toBe(true);
    expect(db.written.has('io.github.acme/d')).toBe(true);
    expect(db.written.has('io.github.acme/taken')).toBe(false);
    expect(synced).toBe(4);
  });

  it('counts only rows actually written', async () => {
    const db = makeSlugConstrainedSupabase({ existingSlugs: ['io-github-acme-taken'] });
    stubRegistryPages([['io.github.acme/taken', 'io.github.acme/fine']]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const synced = await syncFromRegistry(db.client as any);

    expect(synced).toBe(1);
    expect(db.written.size).toBe(1);
  });
});

describe('registry incremental runs', () => {
  it('requests latest versions and writes nothing on an identical second run', async () => {
    const db = makeSlugConstrainedSupabase();
    const fetch = vi.fn(async (_url: string) => ({ ok: true, status: 200, json: async () => makeRegistryResponse({ identifier: 'thing', registryType: 'npm' }) }));
    vi.stubGlobal('fetch', fetch);
    expect(await syncFromRegistry(db.client as never)).toBe(1);
    const written = [...db.written.values()];
    expect(await syncFromRegistry(db.client as never)).toBe(0);
    expect(db.attempts).toHaveLength(1);
    expect([...db.written.values()]).toEqual(written);
    expect(new URL(fetch.mock.calls[0]![0] as string).searchParams.get('version')).toBe('latest');
  });
});
