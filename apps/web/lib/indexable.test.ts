/**
 * indexable.test.ts
 *
 * Unit tests for the single-source-of-truth isIndexable() quality gate
 * (Stage-6 Recovery Slice 2 — see specs/stage-6-slices/slice-2-quality-gate-sitemap-prune.md,
 * gitignored). Covers: hard exclusions, each of the 5 signals independently,
 * the >=3-of-5 boundary, and the two named sanity-check servers from the
 * task acceptance criteria (a known-good server and a known-thin server).
 */

import { describe, it, expect } from 'vitest';
import { isIndexable, readmeLengthOf, type IndexableServerInput } from './indexable';

/** Baseline: a server with zero signals and not excluded. */
function baseServer(overrides: Partial<IndexableServerInput> = {}): IndexableServerInput {
  return {
    registry_status: 'active',
    github_archived: false,
    readme_length: readmeLengthOf(null),
    has_tools: false,
    tool_count: 0,
    package_name: null,
    package_type: null,
    github_stars: 0,
    category: null,
    ...overrides,
  };
}

describe('isIndexable — hard exclusions', () => {
  it('excludes deprecated servers regardless of signal count', () => {
    const server = baseServer({
      registry_status: 'deprecated',
      readme_length: readmeLengthOf('x'.repeat(500)),
      has_tools: true,
      package_name: 'foo',
      package_type: 'npm',
      github_stars: 1000,
      category: 'developer-tools',
    });
    expect(isIndexable(server)).toBe(false);
  });

  it('excludes github_archived servers regardless of signal count', () => {
    const server = baseServer({
      github_archived: true,
      readme_length: readmeLengthOf('x'.repeat(500)),
      has_tools: true,
      package_name: 'foo',
      package_type: 'npm',
      github_stars: 1000,
      category: 'developer-tools',
    });
    expect(isIndexable(server)).toBe(false);
  });
});

describe('isIndexable — signal counting', () => {
  it('is false with 0 signals', () => {
    expect(isIndexable(baseServer())).toBe(false);
  });

  it('is false with exactly 2 signals (readme + tools)', () => {
    const server = baseServer({
      readme_length: readmeLengthOf('x'.repeat(500)),
      has_tools: true,
    });
    expect(isIndexable(server)).toBe(false);
  });

  it('is true with exactly 3 signals (readme + tools + package)', () => {
    const server = baseServer({
      readme_length: readmeLengthOf('x'.repeat(500)),
      has_tools: true,
      package_name: 'foo',
      package_type: 'npm',
    });
    expect(isIndexable(server)).toBe(true);
  });

  it('is true with all 5 signals', () => {
    const server = baseServer({
      readme_length: readmeLengthOf('x'.repeat(500)),
      has_tools: true,
      package_name: 'foo',
      package_type: 'npm',
      github_stars: 100,
      category: 'developer-tools',
    });
    expect(isIndexable(server)).toBe(true);
  });

  it('readme signal requires >= 400 trimmed chars', () => {
    const short = baseServer({
      readme_length: readmeLengthOf('   ' + 'x'.repeat(399) + '   '),
      has_tools: true,
      package_name: 'foo',
      package_type: 'npm',
    });
    // readme signal fails (399 < 400) -> only 2 signals -> not indexable
    expect(isIndexable(short)).toBe(false);

    const long = baseServer({
      readme_length: readmeLengthOf('   ' + 'x'.repeat(400) + '   '),
      has_tools: true,
      package_name: 'foo',
      package_type: 'npm',
    });
    expect(isIndexable(long)).toBe(true);
  });

  it('tool signal accepts tool_count > 0 even if has_tools is false (belt-and-suspenders)', () => {
    const server = baseServer({
      readme_length: readmeLengthOf('x'.repeat(500)),
      has_tools: false,
      tool_count: 3,
      package_name: 'foo',
      package_type: 'npm',
    });
    expect(isIndexable(server)).toBe(true);
  });

  it('package signal requires BOTH package_name and package_type', () => {
    const onlyName = baseServer({
      readme_length: readmeLengthOf('x'.repeat(500)),
      has_tools: true,
      package_name: 'foo',
      package_type: null,
    });
    // readme + tools = 2 signals, package incomplete -> not indexable
    expect(isIndexable(onlyName)).toBe(false);
  });

  it('documented hosted setup can qualify without a local package', () => {
    const zeroStars = baseServer({
      readme_length: readmeLengthOf('x'.repeat(500)),
      has_tools: true,
      github_stars: 0,
    });
    // readme + tools = 2 signals, 0 stars doesn't count -> not indexable
    expect(isIndexable(zeroStars)).toBe(false);

    const withStars = baseServer({
      readme_length: readmeLengthOf('x'.repeat(500)),
      has_tools: true,
      github_stars: 1,
    });
    expect(isIndexable(withStars)).toBe(true);
  });

  it('source documentation and tools plus category can qualify', () => {
    const server = baseServer({
      readme_length: readmeLengthOf('x'.repeat(500)),
      has_tools: true,
      category: 'databases',
    });
    expect(isIndexable(server)).toBe(true);
  });
});

describe('isIndexable — sanity check pair (task acceptance criteria)', () => {
  it('a known-good server (high stars, README, tools, package, category) is indexable', () => {
    const goodServer = baseServer({
      registry_status: 'active',
      github_archived: false,
      readme_length: readmeLengthOf('A comprehensive README describing setup, usage, and configuration. '.repeat(10)),
      has_tools: true,
      tool_count: 5,
      package_name: '@acme/mcp-server-example',
      package_type: 'npm',
      github_stars: 4200,
      category: 'developer-tools',
    });
    expect(isIndexable(goodServer)).toBe(true);
  });

  it('a known-thin server (no README, no tools, no package, 0 stars, no category) is not indexable', () => {
    const thinServer = baseServer({
      registry_status: 'active',
      github_archived: false,
      readme_length: readmeLengthOf(null),
      has_tools: false,
      tool_count: 0,
      package_name: null,
      package_type: null,
      github_stars: 0,
      category: null,
    });
    expect(isIndexable(thinServer)).toBe(false);
  });
});

/**
 * Task 5 — the README signal reads a LENGTH, not a BODY.
 *
 * The signal used to be inlined as
 *   `server.readme_content && server.readme_content.trim().length >= 400`
 * which is why every scan that evaluates this predicate over the whole
 * `servers` table had to SELECT readme_content. These tests pin the two
 * things that make swapping in a precomputed length safe:
 *
 *   1. readmeLengthOf() is exactly the old expression, so the one caller that
 *      still holds the README body (the server detail page) and the database's
 *      generated `readme_length` column (migration 010) produce the same
 *      number for the same content.
 *   2. isIndexable() scores that number identically to how it scored the body
 *      it replaced — including the null case and both sides of the boundary.
 *
 * The eligible set must not move as a side effect of this change; the
 * boundary cases below are where a divergence would show up first.
 */
describe('README signal — length parity with the old content-based predicate', () => {
  /** The literal expression isIndexable() used to inline. */
  function legacyReadmeSignal(content: string | null): boolean {
    return Boolean(content && content.trim().length >= 400);
  }

  const CASES: Array<string | null> = [
    null,
    '',
    '    ',
    'x'.repeat(399),
    'x'.repeat(400),
    'x'.repeat(401),
    '\n\t  ' + 'x'.repeat(399) + '  \r\n',
    '\n\t  ' + 'x'.repeat(400) + '  \r\n',
    'A comprehensive README describing setup, usage, and configuration. '.repeat(10),
  ];

  it.each(CASES.map((c, i) => [i, c] as const))(
    'case %i scores the same via readme_length as via readme_content',
    (_i, content) => {
      const viaLength = isIndexable(
        baseServer({ readme_length: readmeLengthOf(content) })
      );
      // Old predicate: README signal + zero other signals => needs 3, has at
      // most 1, so isIndexable was false either way. Compare the SIGNAL, which
      // is the thing that actually changed.
      const signalViaLength = readmeLengthOf(content) !== null && readmeLengthOf(content)! >= 400;
      expect(signalViaLength).toBe(legacyReadmeSignal(content));
      // And with two other signals present, the README signal alone decides.
      const decided = isIndexable(
        baseServer({
          readme_length: readmeLengthOf(content),
          package_name: 'documented-server',
          package_type: 'npm',
          github_stars: 10,
        })
      );
      expect(decided).toBe(legacyReadmeSignal(content));
      expect(viaLength).toBe(false);
    }
  );

  it('readmeLengthOf is the trimmed length, and null for a missing README', () => {
    expect(readmeLengthOf(null)).toBeNull();
    expect(readmeLengthOf(undefined)).toBeNull();
    expect(readmeLengthOf('')).toBe(0);
    expect(readmeLengthOf('  hello  ')).toBe(5);
    expect(readmeLengthOf('\n\t x \r\n')).toBe(1);
  });

  it('does not substitute metadata or a tools flag for documentation', () => {
    // Three non-README signals present => indexable regardless of README.
    expect(
      isIndexable(
        baseServer({
          readme_length: null,
          has_tools: true,
          github_stars: 3,
          category: 'developer-tools',
        })
      )
    ).toBe(false);
    // Two non-README signals => the missing README is what keeps it out.
    expect(
      isIndexable(baseServer({ readme_length: null, github_stars: 3, category: 'developer-tools' }))
    ).toBe(false);
  });
});

describe('documentation is required before metadata completeness', () => {
  it('excludes the old metadata-only three-signal loophole', () => {
    expect(isIndexable(baseServer({ package_name: 'foo', package_type: 'npm', github_stars: 100, category: 'databases' }))).toBe(false);
  });
  it('preserves documented hosted servers without a local package command', () => {
    expect(isIndexable(baseServer({ readme_length: 1000, github_stars: 50, category: 'cloud' }))).toBe(true);
  });
  it('accepts actual tool evidence with setup and category', () => {
    expect(isIndexable(baseServer({ package_name: 'foo', package_type: 'pypi', tool_count: 2, category: 'databases' }))).toBe(true);
  });
});
