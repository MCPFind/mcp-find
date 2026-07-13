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
import { isIndexable, type IndexableServerInput } from './indexable';

/** Baseline: a server with zero signals and not excluded. */
function baseServer(overrides: Partial<IndexableServerInput> = {}): IndexableServerInput {
  return {
    registry_status: 'active',
    github_archived: false,
    readme_content: null,
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
      readme_content: 'x'.repeat(500),
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
      readme_content: 'x'.repeat(500),
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
      readme_content: 'x'.repeat(500),
      has_tools: true,
    });
    expect(isIndexable(server)).toBe(false);
  });

  it('is true with exactly 3 signals (readme + tools + package)', () => {
    const server = baseServer({
      readme_content: 'x'.repeat(500),
      has_tools: true,
      package_name: 'foo',
      package_type: 'npm',
    });
    expect(isIndexable(server)).toBe(true);
  });

  it('is true with all 5 signals', () => {
    const server = baseServer({
      readme_content: 'x'.repeat(500),
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
      readme_content: '   ' + 'x'.repeat(399) + '   ',
      has_tools: true,
      package_name: 'foo',
      package_type: 'npm',
    });
    // readme signal fails (399 < 400) -> only 2 signals -> not indexable
    expect(isIndexable(short)).toBe(false);

    const long = baseServer({
      readme_content: '   ' + 'x'.repeat(400) + '   ',
      has_tools: true,
      package_name: 'foo',
      package_type: 'npm',
    });
    expect(isIndexable(long)).toBe(true);
  });

  it('tool signal accepts tool_count > 0 even if has_tools is false (belt-and-suspenders)', () => {
    const server = baseServer({
      readme_content: 'x'.repeat(500),
      has_tools: false,
      tool_count: 3,
      package_name: 'foo',
      package_type: 'npm',
    });
    expect(isIndexable(server)).toBe(true);
  });

  it('package signal requires BOTH package_name and package_type', () => {
    const onlyName = baseServer({
      readme_content: 'x'.repeat(500),
      has_tools: true,
      package_name: 'foo',
      package_type: null,
    });
    // readme + tools = 2 signals, package incomplete -> not indexable
    expect(isIndexable(onlyName)).toBe(false);
  });

  it('github_stars signal requires > 0, not just non-null', () => {
    const zeroStars = baseServer({
      readme_content: 'x'.repeat(500),
      has_tools: true,
      github_stars: 0,
    });
    // readme + tools = 2 signals, 0 stars doesn't count -> not indexable
    expect(isIndexable(zeroStars)).toBe(false);

    const withStars = baseServer({
      readme_content: 'x'.repeat(500),
      has_tools: true,
      github_stars: 1,
    });
    expect(isIndexable(withStars)).toBe(true);
  });

  it('category signal is a simple presence check', () => {
    const server = baseServer({
      readme_content: 'x'.repeat(500),
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
      readme_content: 'A comprehensive README describing setup, usage, and configuration. '.repeat(10),
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
      readme_content: null,
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
