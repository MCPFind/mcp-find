#!/usr/bin/env node
/**
 * Structural validation for community server submissions — the PR check.
 *
 * Validates BOTH accepted intake paths:
 *   - community-servers.yml            (hand-edited registry file)
 *   - submissions/<name>.yml           (one file per server, produced by the
 *                                       prefilled GitHub link on /submit)
 *
 * The RULES themselves live in scripts/lib/submission-validation.mjs, because
 * the nightly ingest (packages/sync/src/community-sync.ts) has to apply
 * exactly the same ones. A rule that lived only here would let a submission
 * pass its PR check and then be dropped by the sync; a rule that lived only
 * there would fail a submission after a maintainer had already merged it.
 * Both are silent failures. This file is now only the CLI: file discovery,
 * YAML parsing, reporting, exit code.
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

import { readFileSync, appendFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  REGISTRY_FILE,
  SUBMISSIONS_DIR,
  collectSubmissionFiles,
  loadYamlModule,
  validateDocument,
} from './lib/submission-validation.mjs';

// Re-exported so this file stays the stable public entry point for the rules,
// for the existing test suite and for any future caller that reaches for the
// validator by its familiar name.
export {
  VALID_CATEGORIES,
  VALID_PACKAGE_TYPES,
  REGISTRY_FILE,
  SUBMISSIONS_DIR,
  GITHUB_URL_RE,
  MIN_DESCRIPTION_LENGTH,
  collectSubmissionFiles,
  loadYamlModule,
  entryLabel,
  validateShape,
  validateEntry,
  validateDocument,
} from './lib/submission-validation.mjs';

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
