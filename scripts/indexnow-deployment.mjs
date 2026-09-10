#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const SHA = /^[0-9a-f]{40}$/;
const REPOSITORY = 'MCPFind/mcp-find';
const isVercel = item => item?.creator?.login === 'vercel[bot]';
const isProduction = item => item?.environment === 'Production' && isVercel(item);
const time = value => {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new Error('Deployment timestamp missing or invalid');
  return parsed;
};
export function eligibleEvent(event) {
  return event?.repository?.full_name === REPOSITORY
    && isProduction(event.deployment) && isProduction(event.deployment_status)
    && event.deployment_status.state === 'success';
}

// GitHub's deployment.sha is the deployed commit. github.sha and push.before
// are not deployment baselines. Read successful production history instead.
export function deploymentRange(event, deployments, statuses) {
  if (!eligibleEvent(event)) return { skip: 'not a successful Vercel production event' };
  const current = event.deployment;
  if (!SHA.test(current.sha)) throw new Error('Deployed SHA missing or invalid');
  const recorded = deployments.find(item => item.id === current.id);
  if (!recorded || recorded.sha !== current.sha || !isProduction(recorded)) {
    throw new Error('Event deployment does not match GitHub deployment history');
  }
  const latest = statuses[current.id]?.[0];
  if (!latest || latest.id !== event.deployment_status.id || latest.state !== 'success' || !isProduction(latest)) {
    return { skip: 'deployment status is no longer the verified production success' };
  }
  const deployedAt = time(latest.created_at);
  const successful = deployments.filter(isProduction).flatMap(deployment =>
    (statuses[deployment.id] ?? []).filter(status => status.state === 'success' && isProduction(status))
      .map(status => ({ sha: deployment.sha, id: deployment.id, at: time(status.created_at) })));
  if (successful.some(item => item.id !== current.id && item.at > deployedAt)) {
    return { skip: 'a newer production deployment has already succeeded' };
  }
  const previous = successful.filter(item => item.id !== current.id && item.at < deployedAt)
    .sort((a, b) => b.at - a.at);
  const prior = previous[0];
  if (!prior || !SHA.test(prior.sha)) throw new Error('Previous successful production SHA cannot be verified');
  if (previous.some(item => item.at === prior.at && item.sha !== prior.sha)) {
    throw new Error('Previous production baseline is ambiguous');
  }
  return { base: prior.sha, current: current.sha };
}

export function changedUrls(base, current, cwd = process.cwd()) {
  if (!SHA.test(base) || !SHA.test(current)) throw new Error('Invalid deployment diff SHA');
  for (const sha of [base, current]) execFileSync('git', ['cat-file', '-e', `${sha}^{commit}`], { cwd });
  // No rename detection: renamed posts notify both old and new URLs. Full tree
  // comparison includes additions, changes and deletions across merge commits.
  const files = execFileSync('git', ['diff', '--no-renames', '--name-only', '-z', '--diff-filter=ACMD',
    base, current, '--', 'apps/web/content/blog/*.mdx'], { cwd, encoding: 'utf8' }).split('\0');
  const urls = files.flatMap(file => {
    const match = /^apps\/web\/content\/blog\/([a-z0-9-]+)\.mdx$/.exec(file);
    return match ? [`https://mcpfind.org/blog/${match[1]}`] : [];
  });
  return [...new Set(urls.length ? [...urls, 'https://mcpfind.org/blog'] : [])].sort();
}

function api(path, paginate = false) {
  const args = ['api', path, '--method', 'GET'];
  if (paginate) args.push('--paginate', '--slurp');
  const data = JSON.parse(execFileSync('gh', args, { encoding: 'utf8', timeout: 120000 }));
  return paginate ? data.flat() : data;
}

export function main() {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  if (!eligibleEvent(event)) {
    appendFileSync(process.env.GITHUB_OUTPUT, 'count=0\n');
    console.log('Skipping: not a successful Vercel production deployment.');
    return;
  }
  const deployments = api(`repos/${REPOSITORY}/deployments?environment=Production&per_page=100`, true);
  const statuses = {};
  for (const deployment of deployments.filter(isProduction)) {
    statuses[deployment.id] = api(`repos/${REPOSITORY}/deployments/${deployment.id}/statuses?per_page=100`, true);
  }
  const range = deploymentRange(event, deployments, statuses);
  if (range.skip) {
    appendFileSync(process.env.GITHUB_OUTPUT, 'count=0\n'); console.log(`Skipping: ${range.skip}`); return;
  }
  const checkedOut = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  if (checkedOut !== range.current) throw new Error('Checkout does not match the verified deployed SHA');
  const urls = changedUrls(range.base, range.current);
  const key = '441d971f3ef7aa26f8afe37dfc123a8f';
  writeFileSync('/tmp/indexnow-payload.json', JSON.stringify({ host: 'mcpfind.org', key,
    keyLocation: `https://mcpfind.org/${key}.txt`, urlList: urls }));
  appendFileSync(process.env.GITHUB_OUTPUT, `count=${urls.length}\n`);
  console.log(`Verified production range ${range.base}..${range.current}; ${urls.length} changed URLs.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
