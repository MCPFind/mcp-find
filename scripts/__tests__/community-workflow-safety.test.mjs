import { describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readFileSync as read, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

import {
  MAX_SUBMISSION_BYTES,
  decodeContent,
  isSubmissionPath,
  stagePullRequestSubmissions,
  stageContent,
  stagePath,
} from '../stage-pr-submission-files.mjs';
import { readBaseSubmissionFile } from '../verify-submission-liveness.mjs';

const root = join(import.meta.dirname, '../..');
const preflight = readFileSync(join(root, '.github/workflows/community-submission-preflight.yml'), 'utf8');
const structural = readFileSync(join(root, '.github/workflows/validate-pr.yml'), 'utf8');
const liveness = readFileSync(join(root, '.github/workflows/verify-submission.yml'), 'utf8');
const stagingSource = readFileSync(join(root, 'scripts/stage-pr-submission-files.mjs'), 'utf8');

describe('community submission fork workflow policy', () => {
  it('keeps branch-executing checks on pull_request with only read access', () => {
    for (const workflow of [structural, liveness]) {
      expect(workflow).toMatch(/^on:\n  pull_request:/m);
      expect(workflow).not.toMatch(/^\s*pull-requests:\s*write\s*$/m);
      expect(workflow).toMatch(/^\s*contents:\s*read\s*$/m);
      expect(workflow).not.toContain('secrets.GITHUB_TOKEN');
    }
  });

  it('provides an automatic target preflight without checking out or executing the fork', () => {
    expect(preflight).toMatch(/^on:\n  pull_request_target:/m);
    expect(preflight).toMatch(/^\s*contents:\s*read\s*$/m);
    expect(preflight).toMatch(/^\s*pull-requests:\s*read\s*$/m);
    expect(preflight).not.toMatch(/\$\{\{\s*secrets\./);
    expect(preflight).toContain('ref: ${{ github.event.pull_request.base.sha }}');
    expect(preflight).not.toContain('ref: ${{ github.event.pull_request.head');
    expect(preflight).toContain('persist-credentials: false');
    expect(preflight).toContain('node scripts/stage-pr-submission-files.mjs');
    expect(preflight).toContain('PR_HEAD_REPOSITORY: ${{ github.event.pull_request.head.repo.full_name }}');
    expect(preflight).toContain('node scripts/validate-submissions.mjs');
    expect(preflight).toContain('node scripts/verify-submission-liveness.mjs');
    expect(preflight).toMatch(/actions\/checkout@[0-9a-f]{40}/);
    expect(preflight).toMatch(/actions\/setup-node@[0-9a-f]{40}/);
    expect(stagingSource).toContain('https://api.github.com');
    expect(stagingSource).not.toMatch(/child_process|execSync|spawn\(|git checkout/);
  });
});

describe('preflight submission staging', () => {
  it('accepts only the exact paths consumed by the validators', () => {
    expect(isSubmissionPath('community-servers.yml')).toBe(true);
    expect(isSubmissionPath('submissions/example.yml')).toBe(true);
    expect(isSubmissionPath('submissions/example.yaml')).toBe(true);
    expect(isSubmissionPath('submissions/$(touch PWNED).yml')).toBe(false);
    expect(isSubmissionPath('scripts/validate-submissions.mjs')).toBe(false);
    expect(isSubmissionPath('../package.json')).toBe(false);
    expect(isSubmissionPath('submissions/nested/example.yml')).toBe(false);
  });

  it('writes decoded API content only below the staging root', () => {
    const temp = mkdtempSync(join(tmpdir(), 'mcpfind-preflight-'));
    try {
      const bytes = decodeContent({ type: 'file', encoding: 'base64', content: Buffer.from('servers: []\n').toString('base64') }, 'submissions/example.yml');
      stageContent(temp, 'submissions/example.yml', bytes);
      expect(read(join(temp, 'submissions/example.yml'), 'utf8')).toBe('servers: []\n');
      expect(() => stagePath(temp, '../package.json')).toThrow(/non-submission path/);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it('bounds each API-fetched YAML payload', () => {
    const oversized = Buffer.alloc(MAX_SUBMISSION_BYTES + 1).toString('base64');
    expect(() => decodeContent({ type: 'file', encoding: 'base64', content: oversized }, 'community-servers.yml')).toThrow(/preflight limit/);
  });

  it('retrieves fork YAML from the fork at the immutable event SHA', async () => {
    const temp = mkdtempSync(join(tmpdir(), 'mcpfind-preflight-'));
    const originalFetch = globalThis.fetch;
    const urls = [];
    globalThis.fetch = async (url) => {
      urls.push(String(url));
      if (String(url).includes('/pulls/42/files')) {
        return new Response(JSON.stringify([{ filename: 'submissions/example.yml', status: 'added' }]), { status: 200 });
      }
      return new Response(JSON.stringify({
        type: 'file',
        encoding: 'base64',
        content: Buffer.from('servers: []\n').toString('base64'),
      }), { status: 200 });
    };
    try {
      await stagePullRequestSubmissions({
        repository: 'MCPFind/mcp-find',
        headRepository: 'contributor/mcp-find',
        prNumber: '42',
        headSha: 'a'.repeat(40),
        token: 'test-token',
        root: temp,
      });
      expect(urls[0]).toContain('/repos/MCPFind/mcp-find/pulls/42/files');
      expect(urls[1]).toContain('/repos/contributor/mcp-find/contents/submissions/example.yml');
      expect(urls[1]).toContain(`ref=${'a'.repeat(40)}`);
      expect(read(join(temp, 'submissions/example.yml'), 'utf8')).toBe('servers: []\n');
    } finally {
      globalThis.fetch = originalFetch;
      rmSync(temp, { recursive: true, force: true });
    }
  });

  it('treats shell metacharacters in an existing submission filename as git data', () => {
    const temp = mkdtempSync(join(tmpdir(), 'mcpfind-liveness-git-'));
    const filename = 'submissions/$(touch PWNED).yml';
    const marker = join(temp, 'PWNED');
    try {
      execFileSync('git', ['init', '--quiet'], { cwd: temp });
      execFileSync('git', ['config', 'user.email', 'test@example.invalid'], { cwd: temp });
      execFileSync('git', ['config', 'user.name', 'Regression Test'], { cwd: temp });
      mkdirSync(join(temp, 'submissions'));
      writeFileSync(join(temp, filename), 'servers: []\n');
      execFileSync('git', ['add', '--', filename], { cwd: temp });
      execFileSync('git', ['commit', '--quiet', '-m', 'fixture'], { cwd: temp });
      const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: temp, encoding: 'utf8' }).trim();

      expect(readBaseSubmissionFile(sha, filename, temp)).toBe('servers: []\n');
      expect(existsSync(marker)).toBe(false);
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
});
