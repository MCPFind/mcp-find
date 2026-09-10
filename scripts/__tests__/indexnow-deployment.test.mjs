import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eligibleEvent, deploymentRange, changedUrls } from '../indexnow-deployment.mjs';

const SHA1 = 'a'.repeat(40), SHA2 = 'b'.repeat(40);
const deployment = (id, sha) => ({ id, sha, environment: 'Production', creator: { login: 'vercel[bot]' } });
const status = (id, created_at, state = 'success') => ({ id, created_at, state, environment: 'Production', creator: { login: 'vercel[bot]' } });
function fixture() {
  const deployments = [deployment(2, SHA2), deployment(1, SHA1)];
  const statuses = { 2: [status(20, '2026-09-10T13:00:00Z')], 1: [status(10, '2026-09-09T13:00:00Z')] };
  return { event: { repository: { full_name: 'MCPFind/mcp-find' }, deployment: deployments[0], deployment_status: statuses[2][0] }, deployments, statuses };
}
describe('IndexNow production deployment gating', () => {
  it('uses deployed SHA and prior production success, not github.sha or source-push parent', () => {
    const f = fixture(); f.event.after = 'c'.repeat(40);
    expect(deploymentRange(f.event, f.deployments, f.statuses)).toEqual({ base: SHA1, current: SHA2 });
  });
  it.each(['pending', 'failure', 'error', 'in_progress', 'queued'])('skips %s deployments', state => {
    const f = fixture(); f.event.deployment_status.state = state;
    expect(eligibleEvent(f.event)).toBe(false);
    expect(deploymentRange(f.event, f.deployments, f.statuses).skip).toBeTruthy();
  });
  it('skips previews, wrong producers, push payloads and mismatched environment fields', () => {
    for (const change of [
      f => { f.event.deployment_status.environment = 'Preview'; },
      f => { f.event.deployment.environment = 'Preview'; },
      f => { f.event.deployment.creator.login = 'someone'; },
      f => { f.event.deployment_status.creator.login = 'someone'; },
    ]) { const f = fixture(); change(f); expect(eligibleEvent(f.event)).toBe(false); }
    expect(eligibleEvent({ before: SHA1, after: SHA2 })).toBe(false);
  });
  it('fails closed on missing or inconsistent SHA/base evidence', () => {
    const missing = fixture(); missing.event.deployment.sha = '';
    expect(() => deploymentRange(missing.event, missing.deployments, missing.statuses)).toThrow('SHA');
    const mismatch = fixture(); mismatch.deployments = [deployment(2, SHA1)];
    expect(() => deploymentRange(mismatch.event, mismatch.deployments, mismatch.statuses)).toThrow('history');
    const first = fixture(); first.deployments = [first.deployments[0]];
    expect(() => deploymentRange(first.event, first.deployments, first.statuses)).toThrow('Previous');
  });
  it('does not mistake failed prior deployments for the release baseline', () => {
    const f = fixture(); f.deployments.splice(1, 0, deployment(3, 'c'.repeat(40)));
    f.statuses[3] = [status(30, '2026-09-10T12:00:00Z', 'failure')];
    expect(deploymentRange(f.event, f.deployments, f.statuses).base).toBe(SHA1);
  });
  it('accepts historical success of an inactive prior deployment', () => {
    const f = fixture(); f.statuses[1].unshift(status(11, '2026-09-10T13:00:01Z', 'inactive'));
    expect(deploymentRange(f.event, f.deployments, f.statuses).base).toBe(SHA1);
  });
  it('skips superseded or no-longer-successful status events', () => {
    const f = fixture(); f.statuses[2].unshift(status(21, '2026-09-10T14:00:00Z', 'inactive'));
    expect(deploymentRange(f.event, f.deployments, f.statuses).skip).toBeTruthy();
    const newer = fixture(); newer.deployments.push(deployment(3, 'c'.repeat(40)));
    newer.statuses[3] = [status(30, '2026-09-10T14:00:00Z')];
    expect(deploymentRange(newer.event, newer.deployments, newer.statuses).skip).toContain('newer');
  });
  it('fails closed on an ambiguous production base', () => {
    const f = fixture(); f.deployments.push(deployment(3, 'c'.repeat(40)));
    f.statuses[3] = [status(30, '2026-09-09T13:00:00Z')];
    expect(() => deploymentRange(f.event, f.deployments, f.statuses)).toThrow('ambiguous');
  });
  it('workflow triggers only on deployment status, checks out exact SHA with full history and read-only permissions', () => {
    const workflow = readFileSync(new URL('../../.github/workflows/indexnow-content.yml', import.meta.url), 'utf8');
    expect(workflow).toContain('deployment_status:');
    expect(workflow).not.toMatch(/^  (push|workflow_dispatch):/m);
    expect(workflow).toContain('ref: ${{ github.event.deployment.sha }}');
    expect(workflow).toContain('fetch-depth: 0');
    expect(workflow).toContain('persist-credentials: false');
    expect(workflow).not.toMatch(/: write\b/);
  });
});

describe('deployment-aware changed blog URLs', () => {
  it('covers multiple commits and merge commits, renamed/deleted URLs, excluding unsafe/template slugs', () => {
    const cwd = mkdtempSync(join(tmpdir(), 'indexnow-git-'));
    const git = (...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
    const write = (slug, text) => writeFileSync(join(cwd, 'apps/web/content/blog', slug + '.mdx'), text);
    try {
      git('init', '-q', '-b', 'main'); git('config', 'user.name', 'Fixture'); git('config', 'user.email', 'fixture@example.test');
      mkdirSync(join(cwd, 'apps/web/content/blog'), { recursive: true });
      write('old-name', 'old'); write('deleted', 'delete');
      git('add', '.'); git('commit', '-qm', 'previous production'); const base = git('rev-parse', 'HEAD');
      git('checkout', '-qb', 'articles'); write('first', 'first'); git('add', '.'); git('commit', '-qm', 'first article');
      write('second', 'second'); write('_template', 'template'); git('add', '.'); git('commit', '-qm', 'second article');
      git('checkout', '-q', 'main'); writeFileSync(join(cwd, 'README.md'), 'unrelated'); git('add', '.'); git('commit', '-qm', 'main advances');
      git('merge', '--no-ff', '-qm', 'release multiple commits', 'articles');
      renameSync(join(cwd, 'apps/web/content/blog/old-name.mdx'), join(cwd, 'apps/web/content/blog/new-name.mdx'));
      rmSync(join(cwd, 'apps/web/content/blog/deleted.mdx')); git('add', '.'); git('commit', '-qm', 'rename and delete');
      const current = git('rev-parse', 'HEAD');
      expect(changedUrls(base, current, cwd)).toEqual(['https://mcpfind.org/blog', ...['deleted', 'first', 'new-name', 'old-name', 'second'].map(x => 'https://mcpfind.org/blog/' + x)]);
      expect(changedUrls(current, current, cwd)).toEqual([]);
    } finally { rmSync(cwd, { recursive: true, force: true }); }
  });
});
