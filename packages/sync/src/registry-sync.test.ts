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
