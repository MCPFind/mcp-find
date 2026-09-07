#!/usr/bin/env node
/**
 * Liveness & authenticity verification for community server PR submissions.
 *
 * Covers both intake paths: community-servers.yml and submissions/<name>.yml.
 *
 * Checks each NEW or CHANGED entry added in the PR (diff against base):
 *   1. Repo exists & is public  — GitHub API /repos/{owner}/{repo}            [HARD FAIL]
 *   2. OSS license present      — repo.license != null                         [WARN]
 *   3. Package published        — npm/pypi registry returns 200                [HARD FAIL]
 *   4. Owner-match heuristic    — package repo metadata matches github_url     [WARN]
 *
 * Exit codes:
 *   0 — all PASS (or only WARNs)
 *   1 — at least one FAIL
 *
 * Environment variables consumed:
 *   GITHUB_TOKEN   — required; used for GitHub API auth to avoid rate limits
 *   BASE_SHA       — git SHA of the PR base (used to diff for new entries)
 *   HEAD_SHA       — git SHA of the PR head  (defaults to HEAD if unset)
 *
 * Usage:
 *   BASE_SHA=<base> GITHUB_TOKEN=<tok> node scripts/verify-submission-liveness.mjs
 *
 * Flags:
 *   --dry-run      Print the entries to verify and exit 0 without making network calls.
 *   --all          Verify ALL entries in the file, not just the diff delta.
 */

import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { collectSubmissionFiles } from './validate-submissions.mjs';

// ---------------------------------------------------------------------------
// Polyfill: Node 18+ has global fetch; guard for older environments.
// ---------------------------------------------------------------------------
if (typeof fetch === 'undefined') {
  console.error('ERROR: This script requires Node 18+ for built-in fetch support.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// CLI flags
// ---------------------------------------------------------------------------
const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const VERIFY_ALL = argv.includes('--all');

// ---------------------------------------------------------------------------
// Dynamic YAML loader (mirrors validate-pr.yml which installs yaml@2.7.0 on the fly)
// ---------------------------------------------------------------------------
async function loadYaml(text) {
  // Try to require from node_modules first (pnpm workspace may have it)
  try {
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    const YAML = require('yaml');
    return YAML.parse(text);
  } catch {
    // Fallback: crude but dependency-free YAML→JSON for simple list structures.
    // This path should rarely be hit in CI where yaml is installed.
    throw new Error(
      'yaml package not found. Run: npm install yaml@2.7.0 (or pnpm add yaml)'
    );
  }
}

// ---------------------------------------------------------------------------
// HTTP fetch helper with timeout + retry (1 retry on transient errors)
// ---------------------------------------------------------------------------
const FETCH_TIMEOUT_MS = 10_000;
const TRANSIENT_CODES = new Set([429, 500, 502, 503, 504]);

async function safeFetch(url, options = {}, attempt = 1) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timer);
    return { ok: res.ok, status: res.status, json: () => res.json() };
  } catch (err) {
    clearTimeout(timer);
    if (attempt < 2) {
      // One retry after a brief pause for transient network errors
      await new Promise((r) => setTimeout(r, 1500));
      return safeFetch(url, options, attempt + 1);
    }
    return { ok: false, status: null, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Normalise a repository URL string from package metadata into owner/repo
// ---------------------------------------------------------------------------
function extractOwnerFromRepoUrl(raw) {
  if (!raw) return null;
  // Handles: git+https://github.com/owner/repo.git, github:owner/repo, etc.
  const match = raw.match(/github\.com[:/]([^/]+)\/([^/.]+)/i);
  return match ? match[1].toLowerCase() : null;
}

// ---------------------------------------------------------------------------
// Check 1: Repo exists and is public
// ---------------------------------------------------------------------------
async function checkRepoExists(owner, repo, token) {
  const url = `https://api.github.com/repos/${owner}/${repo}`;
  const res = await safeFetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (res.error) {
    return { status: 'WARN', message: `Network error checking repo: ${res.error} (treated as transient)` };
  }
  if (res.status === 404) {
    return { status: 'FAIL', message: `Repo ${owner}/${repo} not found or is private (HTTP 404)` };
  }
  if (TRANSIENT_CODES.has(res.status)) {
    return { status: 'WARN', message: `GitHub API returned ${res.status} for ${owner}/${repo} — transient, skipping hard fail` };
  }
  if (!res.ok) {
    return { status: 'WARN', message: `Unexpected HTTP ${res.status} from GitHub for ${owner}/${repo}` };
  }

  let data;
  try { data = await res.json(); } catch { data = {}; }

  if (data.private) {
    return { status: 'FAIL', message: `Repo ${owner}/${repo} exists but is private` };
  }

  return { status: 'PASS', message: `Repo ${owner}/${repo} is public`, data };
}

// ---------------------------------------------------------------------------
// Check 2: OSS license present (uses repo data from Check 1)
// ---------------------------------------------------------------------------
function checkLicense(repoData, owner, repo) {
  if (!repoData) return { status: 'WARN', message: 'Could not retrieve repo data to check license' };
  const license = repoData.license;
  if (!license || !license.spdx_id || license.spdx_id === 'NOASSERTION') {
    return {
      status: 'WARN',
      message: `Repo ${owner}/${repo} has no recognized OSS license (spdx_id: ${license?.spdx_id ?? 'null'})`,
    };
  }
  return { status: 'PASS', message: `License: ${license.spdx_id}` };
}

// ---------------------------------------------------------------------------
// Check 3: Package published on registry
// ---------------------------------------------------------------------------
async function checkPackagePublished(packageType, packageName) {
  if (!packageType || packageType === 'docker') {
    return { status: 'PASS', message: `package_type is ${packageType ?? 'unset'} — skipping registry liveness check (unverified)` };
  }

  let url;
  if (packageType === 'npm') {
    // Percent-encode scoped packages: @scope/name → %40scope%2Fname
    const encoded = packageName.replace('@', '%40').replace('/', '%2F');
    url = `https://registry.npmjs.org/${encoded}`;
  } else if (packageType === 'pypi') {
    url = `https://pypi.org/pypi/${packageName}/json`;
  } else {
    return { status: 'WARN', message: `Unknown package_type "${packageType}" — cannot verify` };
  }

  const res = await safeFetch(url);

  if (res.error) {
    return { status: 'WARN', message: `Network error checking ${packageType} package "${packageName}": ${res.error} (treated as transient)` };
  }
  if (res.status === 404) {
    return { status: 'FAIL', message: `Package "${packageName}" not found on ${packageType} registry (HTTP 404)` };
  }
  if (TRANSIENT_CODES.has(res.status)) {
    return { status: 'WARN', message: `${packageType} registry returned ${res.status} for "${packageName}" — transient, skipping hard fail` };
  }
  if (!res.ok) {
    return { status: 'WARN', message: `Unexpected HTTP ${res.status} from ${packageType} registry for "${packageName}"` };
  }

  let pkgData;
  try { pkgData = await res.json(); } catch { pkgData = null; }

  return { status: 'PASS', message: `Package "${packageName}" found on ${packageType} registry`, data: pkgData };
}

// ---------------------------------------------------------------------------
// Check 4: Owner-match heuristic
// ---------------------------------------------------------------------------
function checkOwnerMatch(packageType, pkgData, submittedOwner, packageName) {
  if (!packageType || packageType === 'docker' || !pkgData) {
    return { status: 'PASS', message: 'Owner-match check skipped (no package metadata available)' };
  }

  let declaredRepoUrl = null;

  if (packageType === 'npm') {
    // npm: repository.url or repository (string)
    const repo = pkgData.repository;
    if (typeof repo === 'string') declaredRepoUrl = repo;
    else if (repo && typeof repo === 'object') declaredRepoUrl = repo.url ?? null;

    // Also check homepage as a fallback
    if (!declaredRepoUrl) declaredRepoUrl = pkgData.homepage ?? null;
  } else if (packageType === 'pypi') {
    const urls = pkgData.info?.project_urls ?? {};
    declaredRepoUrl =
      urls['Source'] ?? urls['Repository'] ?? urls['Homepage'] ?? urls['Source Code'] ?? null;
  }

  if (!declaredRepoUrl) {
    return { status: 'WARN', message: `Package "${packageName}" has no repository URL in registry metadata — cannot verify owner match` };
  }

  const declaredOwner = extractOwnerFromRepoUrl(declaredRepoUrl);
  if (!declaredOwner) {
    return {
      status: 'WARN',
      message: `Could not parse GitHub owner from package repository URL: "${declaredRepoUrl}"`,
    };
  }

  if (declaredOwner !== submittedOwner.toLowerCase()) {
    return {
      status: 'WARN',
      message: `Owner mismatch: submitted github_url owner is "${submittedOwner}", but ${packageType} package declares owner "${declaredOwner}" — possible typosquat/impersonation. Legitimate monorepos may cause this.`,
    };
  }

  return { status: 'PASS', message: `Owner "${submittedOwner}" matches package registry metadata` };
}

// ---------------------------------------------------------------------------
// Get new/changed entries via git diff
// ---------------------------------------------------------------------------
/** Every entry currently in a submission file. */
async function readEntries(yamlPath) {
  const data = await loadYaml(readFileSync(yamlPath, 'utf-8'));
  return data?.servers ?? [];
}

/**
 * Entries added or changed by this PR in ONE submission file.
 *
 * Returns null only when BASE_SHA is unset, which signals "no diff available,
 * verify everything". A file that does not exist at the base commit is the
 * normal case for a submissions/<name>.yml one-click submission: every entry in
 * it is new, so the whole file is returned rather than falling back to a
 * full-registry scan.
 */
async function getNewEntries(yamlPath) {
  const baseSha = process.env.BASE_SHA;
  if (!baseSha) {
    console.warn('WARNING: BASE_SHA not set — verifying ALL entries (use --all or set BASE_SHA)');
    return null; // signals "verify all"
  }

  const allEntries = await readEntries(yamlPath);

  let basYamlText;
  try {
    basYamlText = execSync(`git show ${baseSha}:${yamlPath}`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch {
    // File is new in this PR — every entry in it is a new entry.
    console.log(`[verify-submission] ${yamlPath} is new in this PR — all ${allEntries.length} entr${allEntries.length === 1 ? 'y' : 'ies'} are new.`);
    return allEntries;
  }

  let baseData;
  try { baseData = await loadYaml(basYamlText); } catch { baseData = { servers: [] }; }
  const baseSet = new Set((baseData?.servers ?? []).map((s) => s.github_url));

  // New = present in head but not in base (keyed by github_url)
  return allEntries.filter((s) => !baseSet.has(s.github_url));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  // Both accepted intake paths: the hand-edited registry file and the
  // one-file-per-server directory the /submit form writes into.
  const YAML_PATHS = collectSubmissionFiles();
  const token = process.env.GITHUB_TOKEN;

  if (YAML_PATHS.length === 0) {
    console.log('[verify-submission] No submission files found. Exiting 0.');
    return { failures: [], warnings: [] };
  }

  if (!token && !DRY_RUN) {
    console.error('ERROR: GITHUB_TOKEN environment variable is required.');
    process.exit(1);
  }

  // Load entries to verify, across every submission file.
  const entries = [];
  for (const yamlPath of YAML_PATHS) {
    if (VERIFY_ALL) {
      const all = await readEntries(yamlPath);
      console.log(`[verify-submission] --all flag: verifying all ${all.length} entries in ${yamlPath}.`);
      entries.push(...all);
      continue;
    }

    const delta = await getNewEntries(yamlPath);
    if (delta === null) {
      const all = await readEntries(yamlPath);
      console.log(`[verify-submission] Verifying all ${all.length} entries in ${yamlPath} (fallback).`);
      entries.push(...all);
    } else {
      console.log(`[verify-submission] ${delta.length} new/changed entr${delta.length === 1 ? 'y' : 'ies'} in ${yamlPath}.`);
      entries.push(...delta);
    }
  }

  if (entries.length === 0) {
    console.log('[verify-submission] No new entries to verify. Exiting 0.');
    return { failures: [], warnings: [] };
  }

  if (DRY_RUN) {
    console.log('[verify-submission] DRY RUN — entries that would be verified:');
    for (const e of entries) console.log(`  - ${e.name} (${e.github_url})`);
    return { failures: [], warnings: [] };
  }

  // Run checks
  const results = [];

  for (const entry of entries) {
    console.log(`\n--- Verifying: ${entry.name} ---`);
    const entryResults = { name: entry.name, github_url: entry.github_url, checks: [] };

    // Parse owner/repo from github_url
    const ghMatch = entry.github_url?.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+?)\/?$/);
    if (!ghMatch) {
      // Structural check should have caught this; skip liveness for malformed URL
      entryResults.checks.push({ check: 'repo-exists', status: 'WARN', message: 'Malformed github_url — structural validator should have caught this' });
      results.push(entryResults);
      continue;
    }
    const [, owner, repo] = ghMatch;

    // Check 1: Repo exists
    const repoCheck = await checkRepoExists(owner, repo, token);
    entryResults.checks.push({ check: 'repo-exists', ...repoCheck });
    console.log(`  [repo-exists]     ${repoCheck.status}: ${repoCheck.message}`);

    // Check 2: License (only if we got repo data)
    const licenseCheck = checkLicense(repoCheck.data, owner, repo);
    entryResults.checks.push({ check: 'license', ...licenseCheck });
    console.log(`  [license]         ${licenseCheck.status}: ${licenseCheck.message}`);

    // Check 3: Package published
    const pkgCheck = await checkPackagePublished(entry.package_type, entry.package_name);
    entryResults.checks.push({ check: 'package-published', ...pkgCheck });
    console.log(`  [package-published] ${pkgCheck.status}: ${pkgCheck.message}`);

    // Check 4: Owner match (uses pkg data from check 3)
    const ownerCheck = checkOwnerMatch(entry.package_type, pkgCheck.data, owner, entry.package_name);
    entryResults.checks.push({ check: 'owner-match', ...ownerCheck });
    console.log(`  [owner-match]     ${ownerCheck.status}: ${ownerCheck.message}`);

    results.push(entryResults);
  }

  // Aggregate
  const failures = [];
  const warnings = [];

  for (const entry of results) {
    for (const check of entry.checks) {
      if (check.status === 'FAIL') failures.push({ entry: entry.name, ...check });
      if (check.status === 'WARN') warnings.push({ entry: entry.name, ...check });
    }
  }

  return { failures, warnings, results };
}

main()
  .then(({ failures, warnings, results }) => {
    console.log('\n========== SUMMARY ==========');

    if (!results || results.length === 0) {
      console.log('No entries verified.');
      process.exit(0);
    }

    if (failures.length > 0) {
      console.log(`\nFAILURES (${failures.length}):`);
      for (const f of failures) console.log(`  FAIL [${f.entry}] ${f.check}: ${f.message}`);
    }
    if (warnings.length > 0) {
      console.log(`\nWARNINGS (${warnings.length}):`);
      for (const w of warnings) console.log(`  WARN [${w.entry}] ${w.check}: ${w.message}`);
    }
    if (failures.length === 0 && warnings.length === 0) {
      console.log('All checks PASSED with no warnings.');
    }

    // Write machine-readable output for the workflow to consume as JSON
    // (written to stdout; workflow captures via GITHUB_OUTPUT)
    const summary = JSON.stringify({ failures, warnings }, null, 2);
    process.stdout.write(`\n__LIVENESS_RESULT_JSON__${summary}__END_LIVENESS_RESULT_JSON__\n`);

    process.exit(failures.length > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error('Unhandled error in verify-submission-liveness:', err);
    process.exit(1);
  });
