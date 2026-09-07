/**
 * servers-page-cache-and-robots.test.ts
 *
 * T3 (WS-Cache, sprint 2026-08-25-cache-and-indexing): proves
 * app/servers/page.tsx gains a `revalidate` export, and public/robots.txt
 * gains Disallow rules scoped to non-canonical /servers query-string
 * permutations while leaving bare /servers and every /servers/<slug>
 * crawlable.
 *
 * Pre-fix (mcp-find main 6818cb5): app/servers/page.tsx has no `revalidate`
 * export (only `maxDuration = 15`), and public/robots.txt has zero
 * `Disallow` lines across all its declared user-agent blocks (verified live
 * 2026-08-25, evidence/baseline-2026-08-25.md §6).
 *
 * This file lives under lib/ purely so it is picked up by
 * vitest.config.ts's existing `lib/**\/*.test.ts` include glob without
 * widening it — it imports app/servers/page.tsx via a relative path and
 * reads public/robots.txt directly off disk.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('T3 — /servers page cache', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('[AC2/AC3, cites criteria.md C-7] app/servers/page.tsx exports a positive `revalidate`', async () => {
    // lib/queries.ts (imported transitively by page.tsx) calls React's
    // cache() at module top level to build its exported functions — this
    // project's installed React version doesn't ship a real `cache` export,
    // so every other test file in this repo that touches lib/queries.ts
    // mocks it too (see queries-indexable.test.ts). No supabase/next-cache
    // mock is needed here: nothing in the import chain actually invokes a
    // Supabase call at module-evaluation time, only at call time.
    vi.doMock('react', async (importOriginal) => {
      const actual = await importOriginal<typeof import('react')>();
      return { ...actual, cache: (fn: (...args: unknown[]) => unknown) => fn };
    });

    // Pre-fix (6818cb5) this module has no `revalidate` export at all —
    // `mod.revalidate` is `undefined`, so `typeof mod.revalidate === 'number'`
    // is false and this assertion fails.
    const mod = await import('../app/servers/page');
    expect(typeof mod.revalidate).toBe('number');
    expect(mod.revalidate).toBeGreaterThan(0);
  });
});

describe('T3 — robots.txt non-canonical /servers query permutations', () => {
  const robotsPath = path.resolve(__dirname, '../public/robots.txt');
  const content = fs.readFileSync(robotsPath, 'utf-8');

  it('[AC3/AC5, cites criteria.md C-8] contains at least one Disallow rule (pre-fix baseline: zero)', () => {
    const disallowLines = content
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('Disallow:'));
    expect(disallowLines.length).toBeGreaterThan(0);
  });

  it('[AC3, cites criteria.md C-8] disallows each non-canonical filter/sort query param on /servers', () => {
    for (const param of [
      'sort',
      'q',
      'pkg',
      'lang',
      'tools',
      'resources',
      'prompts',
      'official',
      'featured',
    ]) {
      expect(content).toMatch(new RegExp(`Disallow:\\s*/servers\\?\\*${param}=`));
    }
  });

  it('[AC6, negative guard, cites criteria.md C-9] never disallows bare /servers or any /servers/<slug>', () => {
    const disallowLines = content
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.startsWith('Disallow:'));
    for (const line of disallowLines) {
      expect(line).not.toBe('Disallow: /servers');
      expect(line).not.toBe('Disallow: /servers$');
      expect(line.startsWith('Disallow: /servers/')).toBe(false);
    }
  });

  it('[AC3] bounds crawlable pagination depth instead of allowing the full ~1,016-page tail', () => {
    expect(content).toMatch(/Disallow:\s*\/servers\?\*page=/);
    expect(content).toMatch(/Allow:\s*\/servers\?page=1\$/);
    expect(content).not.toMatch(/Allow:\s*\/servers\?page=999\$/);
  });
});
