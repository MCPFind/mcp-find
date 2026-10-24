import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  safeFetch,
  extractOwnerFromRepoUrl,
  checkRepoExists,
  checkLicense,
  checkPackagePublished,
  checkOwnerMatch,
} from '../verify-submission-liveness.mjs';

function mockFetchSequence(responses) {
  const calls = [];
  globalThis.fetch = vi.fn(async (url, options) => {
    calls.push({ url, options });
    const next = responses[Math.min(calls.length - 1, responses.length - 1)];
    if (next instanceof Error) throw next;
    return next;
  });
  return calls;
}

function httpResponse(status, body = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  delete globalThis.fetch;
});

describe('extractOwnerFromRepoUrl', () => {
  it('parses a standard https GitHub URL', () => {
    expect(extractOwnerFromRepoUrl('https://github.com/Owner/Repo')).toBe('owner');
  });

  it('parses git+ssh style URLs with .git suffix', () => {
    expect(extractOwnerFromRepoUrl('git+https://github.com/Owner/Repo.git')).toBe('owner');
  });

  it('parses the npm github: shorthand (previously returned null)', () => {
    expect(extractOwnerFromRepoUrl('github:Owner/Repo')).toBe('owner');
  });

  it('returns null for non-GitHub or empty input', () => {
    expect(extractOwnerFromRepoUrl('https://gitlab.com/owner/repo')).toBeNull();
    expect(extractOwnerFromRepoUrl('')).toBeNull();
    expect(extractOwnerFromRepoUrl(null)).toBeNull();
  });
});

describe('checkRepoExists', () => {
  it('FAILs on 404 (repo missing or private)', async () => {
    mockFetchSequence([httpResponse(404)]);
    const r = await checkRepoExists('o', 'r', 'tok');
    expect(r.status).toBe('FAIL');
    expect(r.message).toContain('404');
  });

  it('FAILs when the repo exists but is private', async () => {
    mockFetchSequence([httpResponse(200, { private: true })]);
    const r = await checkRepoExists('o', 'r', 'tok');
    expect(r.status).toBe('FAIL');
    expect(r.message).toMatch(/private/i);
  });

  it('WARNs on transient 5xx instead of failing', async () => {
    mockFetchSequence([httpResponse(503), httpResponse(503)]);
    const r = await checkRepoExists('o', 'r', 'tok');
    expect(r.status).toBe('WARN');
    expect(r.message).toContain('503');
  });

  it('PASSes a public repo and sends auth headers', async () => {
    const calls = mockFetchSequence([httpResponse(200, { private: false })]);
    const r = await checkRepoExists('o', 'r', 'tok-123');
    expect(r.status).toBe('PASS');
    expect(calls[0].url).toBe('https://api.github.com/repos/o/r');
    expect(calls[0].options.headers.Authorization).toBe('Bearer tok-123');
    expect(calls[0].options.headers['X-GitHub-Api-Version']).toBe('2022-11-28');
  });
});

describe('checkLicense', () => {
  it('PASSes with a recognized SPDX license', () => {
    const r = checkLicense({ license: { spdx_id: 'MIT' } }, 'o', 'r');
    expect(r.status).toBe('PASS');
    expect(r.message).toContain('MIT');
  });

  it('WARNs when license is missing or NOASSERTION', () => {
    expect(checkLicense({ license: null }, 'o', 'r').status).toBe('WARN');
    expect(checkLicense({ license: { spdx_id: 'NOASSERTION' } }, 'o', 'r').status).toBe('WARN');
  });
});

describe('checkPackagePublished', () => {
  it('FAILs when the npm package 404s', async () => {
    mockFetchSequence([httpResponse(404)]);
    const r = await checkPackagePublished('npm', 'some-pkg');
    expect(r.status).toBe('FAIL');
    expect(r.message).toContain('some-pkg');
  });

  it('percent-encodes scoped npm package names', async () => {
    const calls = mockFetchSequence([httpResponse(200, { name: '@scope/pkg' })]);
    const r = await checkPackagePublished('npm', '@scope/pkg');
    expect(r.status).toBe('PASS');
    expect(calls[0].url).toBe('https://registry.npmjs.org/%40scope%2Fpkg');
  });

  it('skips the registry check for docker packages', async () => {
    const r = await checkPackagePublished('docker', 'img');
    expect(r.status).toBe('PASS');
    expect(r.message).toMatch(/skipping/i);
  });

  it('queries the PyPI JSON API for pypi packages', async () => {
    const calls = mockFetchSequence([httpResponse(200, { info: {} })]);
    const r = await checkPackagePublished('pypi', 'my-pkg');
    expect(r.status).toBe('PASS');
    expect(calls[0].url).toBe('https://pypi.org/pypi/my-pkg/json');
  });
});

describe('checkOwnerMatch', () => {
  it('PASSes when npm repository owner matches the submitted owner', () => {
    const pkg = { repository: { url: 'git+https://github.com/Owner/repo.git' } };
    const r = checkOwnerMatch('npm', pkg, 'owner', 'pkg');
    expect(r.status).toBe('PASS');
  });

  it('WARNs on owner mismatch (typosquat heuristic)', () => {
    const pkg = { repository: { url: 'https://github.com/Other/repo' } };
    const r = checkOwnerMatch('npm', pkg, 'owner', 'pkg');
    expect(r.status).toBe('WARN');
    expect(r.message).toMatch(/mismatch/i);
  });

  it('reads pypi project_urls Source/Repository entries', () => {
    const pkg = { info: { project_urls: { Source: 'https://github.com/Owner/repo' } } };
    const r = checkOwnerMatch('pypi', pkg, 'owner', 'pkg');
    expect(r.status).toBe('PASS');
  });

  it('matches npm github: shorthand owners instead of warning (the fix)', () => {
    const pkg = { repository: 'github:Owner/repo' };
    const r = checkOwnerMatch('npm', pkg, 'owner', 'pkg');
    expect(r.status).toBe('PASS');
  });
});

describe('safeFetch', () => {
  it('retries once on a network error and then returns the error', async () => {
    const calls = mockFetchSequence([new Error('socket hangup'), new Error('socket hangup')]);
    const realSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn, ms, ...args) =>
      ms === 1500 ? (fn(), 0) : realSetTimeout(fn, ms, ...args)
    );
    const r = await safeFetch('https://example.test/x');
    expect(r.error).toBe('socket hangup');
    expect(calls.length).toBe(2);
  });

  it('returns ok/status/json from a successful response without retrying', async () => {
    const calls = mockFetchSequence([httpResponse(200, { a: 1 })]);
    const r = await safeFetch('https://example.test/x');
    expect(r.ok).toBe(true);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ a: 1 });
    expect(calls.length).toBe(1);
  });
});
