/**
 * community-sync.test.ts
 *
 * Merging a submission PR used to do nothing. `SELECT source, count(*) FROM
 * servers` returned one row — `registry | 28554` — and zero community rows had
 * ever existed. The type declared `source: 'registry' | 'community'`, the PR
 * check validated submissions, the /submit form generated them, and no writer
 * was ever built. Contributors were told their server was accepted and it never
 * appeared.
 *
 * These tests pin the four things that make the ingest trustworthy rather than
 * merely present:
 *
 *   1. A valid entry actually lands, from EITHER intake path.
 *   2. An invalid entry is skipped WITH a log naming the file, the entry and
 *      the specific rule it broke — and its valid siblings still land. A quiet
 *      drop here would be the same failure the directory has already paid five
 *      months and ~700 rows a sync for.
 *   3. The registry wins a slug it already owns. Registry entries are
 *      self-published by the server's own author; overwriting one with a
 *      third-party submission silently downgrades the catalogue.
 *   4. Two submissions that slugify identically cannot both be sent to one
 *      upsert, because servers.slug is UNIQUE and Postgres would abort the
 *      whole statement.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import { syncCommunitySubmissions, communityId, resolveRepoRoot } from './community-sync';

const HERE = dirname(fileURLToPath(import.meta.url));
const REAL_REPO_ROOT = resolve(HERE, '../../..');
const VALIDATOR_RELATIVE = 'scripts/lib/submission-validation.mjs';

interface ExistingRow {
  id: string;
  slug: string;
  source: string;
}

/**
 * A fixture repository: the workspace marker, the REAL shared validator, and
 * whatever intake files the test wants.
 *
 * The validator is copied rather than stubbed on purpose. The whole point of
 * scripts/lib/submission-validation.mjs is that the PR check and the ingest
 * apply one rule set; a fake validator here would let them drift and these
 * tests would not notice.
 */
function makeRepo(files: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), 'mcpfind-community-'));
  writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages:\n  - "packages/*"\n');
  mkdirSync(join(root, 'scripts', 'lib'), { recursive: true });
  copyFileSync(join(REAL_REPO_ROOT, VALIDATOR_RELATIVE), join(root, VALIDATOR_RELATIVE));

  for (const [relative, contents] of Object.entries(files)) {
    const target = join(root, relative);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents);
  }
  return root;
}

/** One valid submission entry as YAML, with overridable fields. */
function entryYaml(overrides: Record<string, string> = {}): string {
  const fields: Record<string, string> = {
    name: 'Acme MCP Server',
    github_url: 'https://github.com/acme/acme-mcp',
    package_name: '@acme/mcp-server',
    description: 'A perfectly reasonable description that clears the length floor.',
    package_type: 'npm',
    category: 'devtools',
    ...overrides,
  };
  const lines = Object.entries(fields).map(([k, v], i) =>
    `${i === 0 ? '  - ' : '    '}${k}: "${v}"`
  );
  return lines.join('\n');
}

function doc(...entries: string[]): string {
  return `servers:\n${entries.join('\n')}\n`;
}

interface WrittenRow {
  id: string;
  slug: string;
  source?: string;
  name?: string;
  category?: string;
  github_url?: string;
  package_name?: string;
}

/**
 * Supabase double that enforces the real servers_slug_key constraint: one
 * violation aborts the whole upsert statement, exactly as Postgres does.
 */
function makeSupabase(existing: ExistingRow[] = []) {
  const bySlug = new Map<string, ExistingRow>();
  const written = new Map<string, WrittenRow>();
  const upsertCalls: WrittenRow[][] = [];
  for (const row of existing) bySlug.set(row.slug, row);

  return {
    written,
    upsertCalls,
    client: {
      from: (_table: string) => ({
        select: (_columns: string) => ({
          in: async (column: string, values: string[]) => ({
            data: values.map(s => column === 'id' ? written.get(s) : bySlug.get(s)).filter(Boolean),
            error: null,
          }),
        }),
        upsert: async (rows: WrittenRow[]) => {
          upsertCalls.push(rows);
          const staged = new Map(bySlug);
          for (const r of rows) {
            const owner = staged.get(r.slug);
            if (owner !== undefined && owner.id !== r.id) {
              return {
                error: {
                  message: 'duplicate key value violates unique constraint "servers_slug_key"',
                },
              };
            }
            staged.set(r.slug, { id: r.id, slug: r.slug, source: 'community' });
          }
          for (const r of rows) {
            written.set(r.id, r);
            bySlug.set(r.slug, { id: r.id, slug: r.slug, source: 'community' });
          }
          return { error: null };
        },
      }),
    },
  };
}

let logs: string[] = [];
let errorLogs: string[] = [];

beforeEach(() => {
  logs = [];
  errorLogs = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
    logs.push(args.map(String).join(' '));
  });
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
    errorLogs.push(args.map(String).join(' '));
  });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const asClient = (db: ReturnType<typeof makeSupabase>) => db.client as any;

describe('a valid entry is ingested', () => {
  it('writes the row with source: community', async () => {
    const root = makeRepo({ 'community-servers.yml': doc(entryYaml()) });
    const db = makeSupabase();

    const result = await syncCommunitySubmissions(asClient(db), { root });

    expect(result.ingested).toBe(1);
    expect(result.fatal).toBe(false);
    expect(result.errors).toEqual([]);

    const row = [...db.written.values()][0]!;
    expect(row.source).toBe('community');
    expect(row.name).toBe('Acme MCP Server');
    expect(row.slug).toBe('acme-mcp-server');
    expect(row.github_url).toBe('https://github.com/acme/acme-mcp');
  });

  it('derives a stable id from the repository URL, not the title', async () => {
    // A submitter renaming their server must update the row, not mint a second.
    expect(communityId('https://github.com/Acme/Acme-MCP/')).toBe('community:acme/acme-mcp');

    const root = makeRepo({ 'community-servers.yml': doc(entryYaml()) });
    const db = makeSupabase();
    await syncCommunitySubmissions(asClient(db), { root });

    expect([...db.written.keys()]).toEqual(['community:acme/acme-mcp']);
  });

  it('omits category when the submitter did not supply one, so stage 3 keeps its answer', async () => {
    // Writing an explicit null every night would erase the categorizer's work
    // and the column would flicker forever.
    const withCategory = entryYaml();
    const withoutCategory = entryYaml({ name: 'Beta MCP', github_url: 'https://github.com/beta/beta-mcp' })
      .split('\n')
      .filter(l => !l.includes('category:'))
      .join('\n');

    const root = makeRepo({ 'community-servers.yml': doc(withCategory, withoutCategory) });
    const db = makeSupabase();
    await syncCommunitySubmissions(asClient(db), { root });

    const rows = db.upsertCalls.flat();
    const acme = rows.find(r => r.id === 'community:acme/acme-mcp')!;
    const beta = rows.find(r => r.id === 'community:beta/beta-mcp')!;

    expect(acme.category).toBe('devtools');
    expect(Object.keys(beta)).not.toContain('category');
  });
});

describe('both intake paths are globbed', () => {
  it('reads community-servers.yml AND every submissions/*.yml', async () => {
    const root = makeRepo({
      'community-servers.yml': doc(entryYaml()),
      'submissions/beta-mcp.yml': doc(
        entryYaml({ name: 'Beta MCP', github_url: 'https://github.com/beta/beta-mcp' })
      ),
      'submissions/gamma-mcp.yaml': doc(
        entryYaml({ name: 'Gamma MCP', github_url: 'https://github.com/gamma/gamma-mcp' })
      ),
      // Must be ignored — the directory ships a README.
      'submissions/README.md': '# how to submit\n',
    });
    const db = makeSupabase();

    const result = await syncCommunitySubmissions(asClient(db), { root });

    expect(result.ingested).toBe(3);
    expect([...db.written.keys()].sort()).toEqual([
      'community:acme/acme-mcp',
      'community:beta/beta-mcp',
      'community:gamma/gamma-mcp',
    ]);
  });

  it('discovers submission files by glob, not by a hardcoded name', async () => {
    // The /submit form names the file after the server, so the filenames are
    // not knowable ahead of time.
    const root = makeRepo({
      'submissions/an-unpredictable-name-2026.yml': doc(entryYaml()),
    });
    const db = makeSupabase();

    const result = await syncCommunitySubmissions(asClient(db), { root });
    expect(result.ingested).toBe(1);
  });
});

describe('an invalid entry is skipped and logged, never silently dropped', () => {
  it('names the file, the entry and the specific validation failure', async () => {
    const root = makeRepo({
      'submissions/bad-mcp.yml': doc(
        entryYaml({ name: 'Bad MCP', github_url: 'https://github.com/bad/bad-mcp', category: 'crm' })
      ),
    });
    const db = makeSupabase();

    const result = await syncCommunitySubmissions(asClient(db), { root });

    expect(result.ingested).toBe(0);
    expect(db.written.size).toBe(0);

    const joined = errorLogs.join('\n');
    expect(joined).toContain('SKIPPED invalid entry');
    expect(joined).toContain('submissions/bad-mcp.yml');
    expect(joined).toContain('Bad MCP');
    expect(joined).toContain('crm');
  });

  it('surfaces the failure on sync_log and refuses to call the run completed', async () => {
    const root = makeRepo({
      'submissions/bad-mcp.yml': doc(entryYaml({ description: 'too short' })),
    });
    const db = makeSupabase();

    const result = await syncCommunitySubmissions(asClient(db), { root });

    expect(result.fatal).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors.join('\n')).toContain('20 characters');
  });

  it('still writes the valid siblings in the same file', async () => {
    // The whole reason validation is per-entry rather than per-document: one
    // bad entry must not cost the good ones.
    const root = makeRepo({
      'community-servers.yml': doc(
        entryYaml(),
        entryYaml({ name: 'Broken', github_url: 'not-a-github-url' }),
        entryYaml({ name: 'Gamma MCP', github_url: 'https://github.com/gamma/gamma-mcp' })
      ),
    });
    const db = makeSupabase();

    const result = await syncCommunitySubmissions(asClient(db), { root });

    expect(result.ingested).toBe(2);
    expect([...db.written.keys()].sort()).toEqual([
      'community:acme/acme-mcp',
      'community:gamma/gamma-mcp',
    ]);
    expect(result.fatal).toBe(true);
    expect(errorLogs.join('\n')).toContain('github_url');
  });

  it('reports every broken entry, not just the first', async () => {
    const root = makeRepo({
      'community-servers.yml': doc(
        entryYaml({ name: 'One', github_url: 'https://github.com/one/one', category: 'crm' }),
        entryYaml({ name: 'Two', github_url: 'https://github.com/two/two', package_type: 'cargo' })
      ),
    });
    const db = makeSupabase();

    const result = await syncCommunitySubmissions(asClient(db), { root });

    const joined = result.errors.join('\n');
    expect(joined).toContain('One');
    expect(joined).toContain('Two');
  });
});

describe('registry wins on conflict', () => {
  it('does not overwrite a slug already held by a registry row', async () => {
    const db = makeSupabase([
      { id: 'io.github.acme/acme-mcp-server', slug: 'acme-mcp-server', source: 'registry' },
    ]);
    const root = makeRepo({ 'community-servers.yml': doc(entryYaml()) });

    const result = await syncCommunitySubmissions(asClient(db), { root });

    expect(result.ingested).toBe(0);
    expect(result.registryOwned).toBe(1);
    expect(db.upsertCalls.flat()).toEqual([]);
    // The registry row is untouched.
    expect(db.written.size).toBe(0);
  });

  it('logs the skip with both ids and the slug', async () => {
    const db = makeSupabase([
      { id: 'io.github.acme/acme-mcp-server', slug: 'acme-mcp-server', source: 'registry' },
    ]);
    const root = makeRepo({ 'community-servers.yml': doc(entryYaml()) });

    await syncCommunitySubmissions(asClient(db), { root });

    const joined = logs.join('\n');
    expect(joined).toContain('SKIPPED registry-owned slug');
    expect(joined).toContain('acme-mcp-server');
    expect(joined).toContain('io.github.acme/acme-mcp-server');
  });

  it('is not a failure — the registry winning is the designed outcome', async () => {
    const db = makeSupabase([
      { id: 'io.github.acme/acme-mcp-server', slug: 'acme-mcp-server', source: 'registry' },
    ]);
    const root = makeRepo({ 'community-servers.yml': doc(entryYaml()) });

    const result = await syncCommunitySubmissions(asClient(db), { root });

    expect(result.fatal).toBe(false);
    expect(result.errors).toEqual([]);
  });

  it('still writes the other submissions in the same run', async () => {
    const db = makeSupabase([
      { id: 'io.github.acme/acme-mcp-server', slug: 'acme-mcp-server', source: 'registry' },
    ]);
    const root = makeRepo({
      'community-servers.yml': doc(
        entryYaml(),
        entryYaml({ name: 'Beta MCP', github_url: 'https://github.com/beta/beta-mcp' })
      ),
    });

    const result = await syncCommunitySubmissions(asClient(db), { root });

    expect(result.ingested).toBe(1);
    expect([...db.written.keys()]).toEqual(['community:beta/beta-mcp']);
  });

  it('DOES update a slug held by an existing community row', async () => {
    // Registry authority is specific to the registry. A community row is this
    // stage's own output from a previous night and must stay refreshable.
    const db = makeSupabase([
      { id: 'community:acme/acme-mcp', slug: 'acme-mcp-server', source: 'community' },
    ]);
    const root = makeRepo({ 'community-servers.yml': doc(entryYaml()) });

    const result = await syncCommunitySubmissions(asClient(db), { root });

    expect(result.registryOwned).toBe(0);
    expect(result.ingested).toBe(1);
  });
});

describe('slug collision between two submissions', () => {
  it('never sends two ids sharing one slug to Postgres', async () => {
    // servers.slug is UNIQUE and Postgres aborts the whole statement on a
    // violation, so both rows plus every innocent row in the batch would die.
    const root = makeRepo({
      'community-servers.yml': doc(
        entryYaml({ name: 'Acme MCP', github_url: 'https://github.com/acme/one' }),
        entryYaml({ name: 'acme mcp', github_url: 'https://github.com/acme/two' }),
        entryYaml({ name: 'Innocent MCP', github_url: 'https://github.com/innocent/mcp' })
      ),
    });
    const db = makeSupabase();

    const result = await syncCommunitySubmissions(asClient(db), { root });

    for (const call of db.upsertCalls) {
      const slugs = call.map(r => r.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
    }
    // The innocent row must survive the collision.
    expect(db.written.has('community:innocent/mcp')).toBe(true);
    expect(result.ingested).toBe(2);
  });

  it('skips the loser loudly and fails the stage', async () => {
    const root = makeRepo({
      'community-servers.yml': doc(
        entryYaml({ name: 'Acme MCP', github_url: 'https://github.com/acme/one' })
      ),
      'submissions/acme-again.yml': doc(
        entryYaml({ name: 'acme  mcp', github_url: 'https://github.com/acme/two' })
      ),
    });
    const db = makeSupabase();

    const result = await syncCommunitySubmissions(asClient(db), { root });

    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.slug).toBe('acme-mcp');
    expect(result.fatal).toBe(true);
    expect(errorLogs.join('\n')).toContain('acme-mcp');
    expect(result.errors.join('\n')).toContain('not written');
  });

  it('picks the same winner regardless of the order the files are read in', async () => {
    // The winner must be a property of the data, not of directory ordering.
    const forward = makeSupabase();
    await syncCommunitySubmissions(asClient(forward), {
      root: makeRepo({
        'community-servers.yml': doc(
          entryYaml({ name: 'Acme MCP', github_url: 'https://github.com/acme/aaa' }),
          entryYaml({ name: 'acme mcp', github_url: 'https://github.com/acme/zzz' })
        ),
      }),
    });

    const reversed = makeSupabase();
    await syncCommunitySubmissions(asClient(reversed), {
      root: makeRepo({
        'community-servers.yml': doc(
          entryYaml({ name: 'acme mcp', github_url: 'https://github.com/acme/zzz' }),
          entryYaml({ name: 'Acme MCP', github_url: 'https://github.com/acme/aaa' })
        ),
      }),
    });

    expect([...forward.written.keys()]).toEqual([...reversed.written.keys()]);
  });

  it('a collision with a row outside this run costs that row, not the batch', async () => {
    // A community row ingested on an earlier night still holds the slug, and
    // that collision is invisible from the batch — so the batch has to survive
    // meeting one via bisection.
    const db = makeSupabase([
      { id: 'community:old/holder', slug: 'acme-mcp-server', source: 'community' },
    ]);
    const root = makeRepo({
      'community-servers.yml': doc(
        entryYaml(),
        entryYaml({ name: 'Beta MCP', github_url: 'https://github.com/beta/beta-mcp' }),
        entryYaml({ name: 'Gamma MCP', github_url: 'https://github.com/gamma/gamma-mcp' })
      ),
    });

    const result = await syncCommunitySubmissions(asClient(db), { root });

    expect(result.ingested).toBe(2);
    expect(db.written.has('community:beta/beta-mcp')).toBe(true);
    expect(db.written.has('community:gamma/gamma-mcp')).toBe(true);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0]!.id).toBe('community:acme/acme-mcp');
    expect(result.fatal).toBe(true);
  });
});

describe('empty and missing files', () => {
  it('is a clean no-op when neither intake path exists', async () => {
    const root = makeRepo();
    const db = makeSupabase();

    const result = await syncCommunitySubmissions(asClient(db), { root });

    expect(result.ingested).toBe(0);
    expect(result.errors).toEqual([]);
    expect(result.fatal).toBe(false);
    expect(db.upsertCalls).toEqual([]);
  });

  it('does not redden the run for an emptied servers array', async () => {
    // An emptied file has no submission that could fail to appear. Failing a
    // 28,000-row sync over it would be a false alarm, and false alarms are how
    // real alarms get ignored.
    const root = makeRepo({
      'community-servers.yml': 'servers: []\n',
      'submissions/empty.yml': 'servers: []\n',
    });
    const db = makeSupabase();

    const result = await syncCommunitySubmissions(asClient(db), { root });

    expect(result.ingested).toBe(0);
    expect(result.errors).toEqual([]);
    expect(result.fatal).toBe(false);
  });

  it('DOES fail on a malformed document, which is a different thing', async () => {
    const root = makeRepo({ 'submissions/broken.yml': 'not_servers:\n  - nope\n' });
    const db = makeSupabase();

    const result = await syncCommunitySubmissions(asClient(db), { root });

    expect(result.fatal).toBe(true);
    expect(result.errors.join('\n')).toContain('servers');
    expect(errorLogs.join('\n')).toContain('MALFORMED');
  });

  it('DOES fail on unparseable YAML, naming the file', async () => {
    const root = makeRepo({
      'community-servers.yml': doc(entryYaml()),
      'submissions/broken.yml': 'servers:\n  - name: "unterminated\n   bad: [\n',
    });
    const db = makeSupabase();

    const result = await syncCommunitySubmissions(asClient(db), { root });

    expect(result.fatal).toBe(true);
    expect(result.errors.join('\n')).toContain('submissions/broken.yml');
    // The good file still lands — one broken submission is not the others' fault.
    expect(result.ingested).toBe(1);
  });

  it('fails loudly when the shared validator is missing rather than validating locally', async () => {
    const root = mkdtempSync(join(tmpdir(), 'mcpfind-novalidator-'));
    writeFileSync(join(root, 'pnpm-workspace.yaml'), 'packages: []\n');
    writeFileSync(join(root, 'community-servers.yml'), doc(entryYaml()));
    const db = makeSupabase();

    const result = await syncCommunitySubmissions(asClient(db), { root });

    expect(result.fatal).toBe(true);
    expect(result.errors.join('\n')).toContain('submission validator not found');
    expect(db.upsertCalls).toEqual([]);
  });
});

describe('repository root resolution', () => {
  it('finds the root from a nested directory, because cwd is packages/sync', async () => {
    // `pnpm --filter @mcpfind/sync run start` sets cwd to packages/sync, two
    // levels below the intake files. Marker-walking is also depth-independent,
    // so it works from src/ under tsx and from dist/ after a build.
    expect(resolveRepoRoot(join(REAL_REPO_ROOT, 'packages/sync/src'))).toBe(REAL_REPO_ROOT);
    expect(resolveRepoRoot(join(REAL_REPO_ROOT, 'packages/sync/dist'))).toBe(REAL_REPO_ROOT);
  });

  it('returns null rather than guessing when there is no marker above', () => {
    const orphan = mkdtempSync(join(tmpdir(), 'mcpfind-orphan-'));
    expect(resolveRepoRoot(orphan)).toBeNull();
  });
});
