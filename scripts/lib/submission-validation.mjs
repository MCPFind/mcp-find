/**
 * The submission rule set — the single definition of what a valid community
 * server entry is.
 *
 * This file exists because there are now TWO consumers of these rules and they
 * must never disagree:
 *
 *   1. scripts/validate-submissions.mjs — the PR check. Runs under bare
 *      `node` in a fork-safe workflow with no workspace install and no
 *      TypeScript build.
 *   2. packages/sync/src/community-sync.ts — the nightly ingest. Decides
 *      which merged entries actually reach the `servers` table.
 *
 * Constraint (1) is why this is plain ESM JavaScript with zero dependencies
 * rather than TypeScript in packages/shared: the PR check must keep working
 * with `npm install yaml` and nothing else. Constraint (2) is why it exports
 * the rules as composable pieces — the ingest needs to reject ONE entry and
 * keep its siblings, which a document-level pass/fail cannot express.
 *
 * If a rule lives in only one of the two consumers, a submission can pass its
 * PR check and then be dropped by the nightly sync, or vice versa. Both are
 * silent failures, which is the exact class of bug this repository has spent
 * five months paying for. Add rules here, never in a consumer.
 */

import { existsSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

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

export const GITHUB_URL_RE = /^https:\/\/github\.com\/[^/]+\/[^/]+\/?$/;
export const MIN_DESCRIPTION_LENGTH = 20;

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
 *
 * Both intake paths are discovered, never hardcoded by filename — the
 * submissions/ directory is written one-file-per-server by the prefilled
 * GitHub link that apps/web/components/SubmitForm.tsx generates, so its
 * contents are not knowable ahead of time.
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

/** The prefix both consumers use to name one entry, so their logs line up. */
export function entryLabel(file, index) {
  return `${basename(file)} — entry ${index + 1}`;
}

/**
 * Document-level checks only: is there a usable `servers` array at all?
 *
 * Returning [] means `data.servers` is an array the caller may iterate.
 *
 * `allowEmpty` exists because the two consumers disagree about one case, and
 * only this one. For the PR check, an empty `servers:` array is a mistake
 * worth failing on — the contributor opened a PR that submits nothing. For the
 * nightly ingest it is a no-op: an emptied file has no submission that could
 * fail to appear, and reddening a 28,000-row sync over it would be a false
 * alarm. False alarms are how real alarms get ignored.
 */
export function validateShape(file, data, options = {}) {
  const { allowEmpty = false } = options;
  const label = basename(file);

  if (!data || !data.servers || !Array.isArray(data.servers)) {
    return [`${label}: invalid YAML — must have a top-level \`servers\` array`];
  }
  if (data.servers.length === 0 && !allowEmpty) {
    return [`${label}: \`servers\` array is empty`];
  }
  return [];
}

/**
 * Validate ONE entry. Returns unprefixed, human-readable error strings; empty
 * means the entry is valid.
 *
 * Kept separate from validateDocument so the nightly ingest can skip a single
 * bad entry and still write its valid siblings. A document-level verdict would
 * force it to choose between dropping good servers and writing bad ones.
 */
export function validateEntry(server) {
  const errors = [];

  if (!server || typeof server !== 'object') {
    return ['entry is not a mapping'];
  }

  if (!server.name) errors.push('missing `name`');
  if (!server.github_url) errors.push('missing `github_url`');
  if (!server.package_name) errors.push('missing `package_name`');
  if (!server.description) errors.push('missing `description`');

  if (server.github_url && !GITHUB_URL_RE.test(server.github_url)) {
    errors.push(
      `\`github_url\` must be a plain repo URL (https://github.com/owner/repo), got "${server.github_url}"`
    );
  }

  if (server.description && server.description.length < MIN_DESCRIPTION_LENGTH) {
    errors.push(`\`description\` must be at least ${MIN_DESCRIPTION_LENGTH} characters`);
  }

  if (server.package_type && !VALID_PACKAGE_TYPES.includes(server.package_type)) {
    errors.push(
      `invalid \`package_type\` "${server.package_type}" — must be one of ${VALID_PACKAGE_TYPES.join(', ')}`
    );
  }

  if (server.category && !VALID_CATEGORIES.includes(server.category)) {
    errors.push(
      `invalid \`category\` "${server.category}" — must be one of ${VALID_CATEGORIES.join(', ')}`
    );
  }

  return errors;
}

/**
 * Validate one parsed YAML document. Returns an array of human-readable error
 * strings — empty means the document is valid.
 *
 * Composed from validateShape + validateEntry so the PR check and the nightly
 * ingest are provably applying the same rules.
 */
export function validateDocument(file, data, options = {}) {
  const shapeErrors = validateShape(file, data, options);
  if (shapeErrors.length > 0) return shapeErrors;

  const errors = [];
  for (const [i, server] of data.servers.entries()) {
    const prefix = entryLabel(file, i);
    for (const e of validateEntry(server)) errors.push(`${prefix}: ${e}`);
  }
  return errors;
}
