#!/usr/bin/env node
/**
 * Stage changed community-submission YAML from a pull request as data.
 *
 * This helper is deliberately used only by the pull_request_target preflight.
 * The runner has checked out the immutable base revision before this runs; the
 * helper never fetches a git ref, never evaluates fork files, and writes only
 * the two submission paths consumed by the trusted validators.  Fork content
 * is treated as opaque UTF-8 text until the base revision's YAML parser reads
 * it.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const MAX_SUBMISSION_FILES = 25;
export const MAX_SUBMISSION_BYTES = 256 * 1024;
export const SUBMISSION_FILENAME_RE = /^[a-z0-9][a-z0-9._-]{0,127}\.ya?ml$/i;

/** The exact paths the validators discover; no nested or arbitrary files. */
export function isSubmissionPath(path) {
  if (path === 'community-servers.yml') return true;
  if (!path.startsWith('submissions/')) return false;
  return SUBMISSION_FILENAME_RE.test(path.slice('submissions/'.length));
}

export function stagePath(root, relativePath) {
  if (!isSubmissionPath(relativePath)) {
    throw new Error(`Refusing to stage a non-submission path: ${relativePath}`);
  }

  const rootPath = resolve(root);
  const target = resolve(rootPath, relativePath);
  if (!target.startsWith(`${rootPath}/`)) {
    throw new Error(`Refusing to write outside the staging root: ${relativePath}`);
  }
  return target;
}

export function decodeContent(payload, relativePath) {
  if (!payload || payload.type !== 'file' || payload.encoding !== 'base64' || typeof payload.content !== 'string') {
    throw new Error(`GitHub did not return base64 file content for ${relativePath}`);
  }

  const bytes = Buffer.from(payload.content.replace(/\s/g, ''), 'base64');
  if (bytes.length > MAX_SUBMISSION_BYTES) {
    throw new Error(`${relativePath} exceeds the ${MAX_SUBMISSION_BYTES}-byte preflight limit`);
  }
  return bytes;
}

export function stageContent(root, relativePath, bytes) {
  const target = stagePath(root, relativePath);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes, { mode: 0o600 });
}

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function requestUrl(path, query = {}) {
  const url = new URL(`https://api.github.com${path}`);
  for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  return url;
}

async function githubJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) throw new Error(`GitHub API request failed (${response.status})`);
  return response.json();
}

export async function stagePullRequestSubmissions({ repository, headRepository, prNumber, headSha, token, root }) {
  if (!/^[^/]+\/[^/]+$/.test(repository)) throw new Error('GITHUB_REPOSITORY must be owner/repository');
  if (!/^[^/]+\/[^/]+$/.test(headRepository)) throw new Error('PR_HEAD_REPOSITORY must be owner/repository');
  if (!/^\d+$/.test(prNumber)) throw new Error('PR_NUMBER must be numeric');
  if (!/^[0-9a-f]{40}$/i.test(headSha)) throw new Error('PR_HEAD_SHA must be a full Git SHA');

  const [owner, repo] = repository.split('/');
  const [headOwner, headRepo] = headRepository.split('/');
  const files = [];
  for (let page = 1; page <= 30; page += 1) {
    const listed = await githubJson(
      requestUrl(`/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}/files`, {
        per_page: '100',
        page: String(page),
      }),
      token
    );
    if (!Array.isArray(listed)) throw new Error('GitHub returned an invalid pull request file list');
    files.push(...listed);
    if (listed.length < 100) break;
  }

  const submissionFiles = files.filter((file) => file.status !== 'removed' && isSubmissionPath(file.filename));
  // A deletion has no head-side YAML to validate. Leave the trusted base tree
  // intact and let the validators confirm that the remaining entries are
  // valid, rather than turning a data-only no-op into an infrastructure error.
  if (submissionFiles.length === 0) return [];
  if (submissionFiles.length > MAX_SUBMISSION_FILES) {
    throw new Error(`Refusing to stage more than ${MAX_SUBMISSION_FILES} submission files`);
  }

  for (const file of submissionFiles) {
    const encodedPath = file.filename.split('/').map(encodeURIComponent).join('/');
    const content = await githubJson(
      // For a fork, the head SHA is not necessarily addressable through the
      // base repository's Contents API. Fetch it from the declared head repo
      // at the immutable event SHA; path segments and ref are data encoded into
      // an api.github.com URL, never interpolated into a shell command.
      requestUrl(`/repos/${encodeURIComponent(headOwner)}/${encodeURIComponent(headRepo)}/contents/${encodedPath}`, { ref: headSha }),
      token
    );
    stageContent(root, file.filename, decodeContent(content, file.filename));
  }

  return submissionFiles.map((file) => file.filename);
}

export async function main() {
  const root = process.cwd();
  const staged = await stagePullRequestSubmissions({
    repository: required('GITHUB_REPOSITORY'),
    headRepository: required('PR_HEAD_REPOSITORY'),
    prNumber: required('PR_NUMBER'),
    headSha: required('PR_HEAD_SHA'),
    token: required('GITHUB_TOKEN'),
    root,
  });
  console.log(`Staged ${staged.length} changed submission file(s): ${staged.join(', ')}`);
}

if (process.argv[1] && new URL(import.meta.url).pathname === process.argv[1]) {
  main().catch((error) => {
    console.error(`[submission-preflight] ${error.message}`);
    process.exitCode = 1;
  });
}
