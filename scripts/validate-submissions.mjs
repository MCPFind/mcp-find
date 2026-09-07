#!/usr/bin/env node
/**
 * Structural validation for community server submissions.
 *
 * Validates BOTH accepted intake paths:
 *   - community-servers.yml            (hand-edited registry file)
 *   - submissions/<name>.yml           (one file per server, produced by the
 *                                       prefilled GitHub link on /submit)
 *
 * This used to live inline inside .github/workflows/validate-pr.yml as an
 * actions/github-script block that reported by posting a PR comment and adding
 * a label. That could not work for the fork PRs it exists to serve: a
 * `pull_request` event from a fork gets a read-only GITHUB_TOKEN regardless of
 * the `permissions:` block, so issues.createComment and issues.addLabels 403
 * the first time a maintainer approves a fork run — and because the comment was
 * posted BEFORE core.setFailed, the 403 aborted the step and the contributor
 * saw an opaque API error instead of their validation errors.
 *
 * So: no API calls at all. Results go to the job summary and to stdout, and the
 * process exit code carries the verdict. Both work with a read-only token.
 *
 * Exit codes:
 *   0 — every entry valid
 *   1 — at least one validation error
 *   2 — could not run (no submission files found)
 *
 * Usage:
 *   node scripts/validate-submissions.mjs
 */

import { readFileSync, existsSync, readdirSync, appendFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Canonical category list. Must stay identical to CATEGORIES in
 * packages/shared/src/categories.ts — scripts/__tests__/validate-submissions.test.mjs
 * asserts that parity so the two cannot drift.
 *
 * Note `crm` and `maps` are absent on purpose: they exist on a handful of
 * legacy directory rows but are not in the schema, and the previous inline
 * validator wrongly accepted `crm` while rejecting nine categories that ARE in
 * the schema.
 */
export const VALID_CATEGORIES = [
  'databases',
  'cloud',
  'monitoring',
  'security',
  'testing',
  'analytics',
  'automation',
  'media',
  'documentation',
  'social',
  'ecommerce',
  'devtools',
  'communication',
  'filesystems',
  'search',
  'ai-ml',
  'finance',
  'productivity',
  'other',
];

export const VALID_PACKAGE_TYPES = ['npm', 'pypi', 'docker'];

export const REGISTRY_FILE = 'community-servers.yml';
export const SUBMISSIONS_DIR = 'submissions';

const GITHUB_URL_RE = /^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/;
const MIN_DESCRIPTION_LENGTH = 20;

/**
 * Resolve the `yaml` package, which CI installs on the fly
 * (npm install yaml@2.7.0). Returns null when it is not resolvable so the
 * caller can exit 2 ("could not run") instead of reporting a missing dependency
 * as though it were a contributor's malformed submission.
 */
export async function loadYamlModule() {
  try {
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    return require('yaml');
  } catch {
    return null;
  }
}

/**
 * Every file that may carry submissions: the registry file plus any .yml/.yaml
 * in submissions/. README.md and other non-YAML files are ignored.
 */
export function collectSubmissionFiles(root = process.cwd()) {
  const files = [];
  if (existsSync(join(root, REGISTRY_FILE))) files.push(REGISTRY_FILE);

  const dir = join(root, SUBMISSIONS_DIR);
  if (existsSync(dir)) {
    const entries = readdirSync(dir)
      .filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))
      .sort();
    for (const f of entries) files.push(`${SUBMISSIONS_DIR}/${f}`);
  }
  return files;
}

/**
 * Validate one parsed YAML document. Returns an array of human-readable error
 * strings — empty means the document is valid.
 */
export function validateDocument(file, data) {
  const errors = [];
  const label = basename(file);

  if (!data || !data.servers || !Array.isArray(data.servers)) {
    errors.push(`${label}: invalid YAML — must have a top-level \`servers\` array`);
    return errors;
  }

  if (data.servers.length === 0) {
    errors.push(`${label}: \`servers\` array is empty`);
    return errors;
  }

  for (const [i, server] of data.servers.entries()) {
    const prefix = `${label} — entry ${i + 1}`;

    if (!server || typeof server !== 'object') {
      errors.push(`${prefix}: entry is not a mapping`);
      continue;
    }

    if (!server.name) errors.push(`${prefix}: missing \`name\``);
    if (!server.github_url) errors.push(`${prefix}: missing \`github_url\``);
    if (!server.package_name) errors.push(`${prefix}: missing \`package_name\``);
    if (!server.description) errors.push(`${prefix}: missing \`description\``);

    if (server.github_url && !GITHUB_URL_RE.test(server.github_url)) {
      errors.push(
        `${prefix}: \`github_url\` must be a plain repo URL (https://github.com/owner/repo), got "${server.github_url}"`
      );
    }

    if (server.description && server.description.length < MIN_DESCRIPTION_LENGTH) {
      errors.push(`${prefix}: \`description\` must be at least ${MIN_DESCRIPTION_LENGTH} characters`);
    }

    if (server.package_type && !VALID_PACKAGE_TYPES.includes(server.package_type)) {
      errors.push(
        `${prefix}: invalid \`package_type\` "${server.package_type}" — must be one of ${VALID_PACKAGE_TYPES.join(', ')}`
      );
    }

    if (server.category && !VALID_CATEGORIES.includes(server.category)) {
      errors.push(
        `${prefix}: invalid \`category\` "${server.category}" — must be one of ${VALID_CATEGORIES.join(', ')}`
      );
    }
  }

  return errors;
}

/** Render the verdict as GitHub-flavoured markdown for the job summary. */
export function renderSummary(files, errors) {
  const lines = [];
  if (errors.length === 0) {
    lines.push('## Validation passed');
    lines.push('');
    lines.push('All entries are structurally valid and ready for maintainer review.');
  } else {
    lines.push('## Validation failed');
    lines.push('');
    lines.push(`${errors.length} problem${errors.length === 1 ? '' : 's'} found. Fix these and push again:`);
    lines.push('');
    for (const e of errors) lines.push(`- ${e}`);
  }
  lines.push('');
  lines.push('<details><summary>Files checked</summary>');
  lines.push('');
  for (const f of files) lines.push(`- \`${f}\``);
  lines.push('');
  lines.push('</details>');
  lines.push('');
  lines.push('See CONTRIBUTING.md for the field reference and the valid category list.');
  return lines.join('\n');
}

function writeStepSummary(markdown) {
  const path = process.env.GITHUB_STEP_SUMMARY;
  if (!path) return;
  try {
    appendFileSync(path, markdown + '\n');
  } catch (err) {
    console.warn(`[validate-submissions] Could not write job summary: ${err.message}`);
  }
}

export async function main(root = process.cwd()) {
  const files = collectSubmissionFiles(root);

  if (files.length === 0) {
    console.error(
      `[validate-submissions] No submission files found. Expected ${REGISTRY_FILE} or ${SUBMISSIONS_DIR}/*.yml`
    );
    return 2;
  }

  const YAML = await loadYamlModule();
  if (!YAML) {
    console.error(
      '[validate-submissions] The `yaml` package is not resolvable. Run: npm install yaml@2.7.0'
    );
    return 2;
  }

  const errors = [];
  for (const file of files) {
    let data;
    try {
      data = YAML.parse(readFileSync(join(root, file), 'utf-8'));
    } catch (err) {
      errors.push(`${basename(file)}: could not parse YAML — ${err.message}`);
      continue;
    }
    errors.push(...validateDocument(file, data));
  }

  const summary = renderSummary(files, errors);
  writeStepSummary(summary);
  console.log(summary);

  if (errors.length > 0) {
    console.error(`\n[validate-submissions] ${errors.length} validation error(s).`);
    return 1;
  }
  console.log(`\n[validate-submissions] ${files.length} file(s) valid.`);
  return 0;
}

// Only run when invoked directly, so tests can import the pure functions.
const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];

if (invokedDirectly) {
  main().then((code) => process.exit(code));
}
