#!/usr/bin/env node
/**
 * check-cache-invalidation.mjs
 *
 * Enforces decision-register.md D-2 (mcpfind sprint 2026-08-25,
 * "cache-and-indexing"): cache invalidation MUST be scoped per-slug, never
 * a blanket shared tag as the sole trigger. Wired into
 * scripts/pre_push_gates.sh and .github/workflows/ci.yml as a named gate
 * (task T9). Criteria: C-24a, C-24b, C-25, C-26 in
 * specs/sprints/2026-08-25-cache-and-indexing/criteria.md.
 *
 * Two independent checks, each cited by file:line on failure:
 *
 * CHECK A — blanket-tag revalidation (C-24a).
 *   Cross-references every `revalidateTag(...)` call site in apps/web
 *   against the tag distribution declared across every `unstable_cache(...,
 *   { tags: [...] })` call site in apps/web/lib/queries.ts. A tag is
 *   "blanket" when it appears in >= BLANKET_SHARE_THRESHOLD of all
 *   unstable_cache call sites. A `revalidateTag()` call on a blanket tag
 *   is a VIOLATION unless the SAME file also contains at least one
 *   narrower revalidateTag() call (a templated tag like
 *   `server-${slug}`, or a static tag whose share is below the
 *   threshold) — i.e. unless the blanket tag is demonstrably NOT the sole
 *   invalidation trigger for its own cache entries.
 *
 *   This is a textual/static heuristic, not a real TypeScript parser.
 *   Stated tradeoff:
 *     - False-negative risk: a call site that builds its revalidateTag
 *       argument through an indirection this regex can't see (e.g. a tag
 *       string assembled in a helper function and imported, rather than
 *       written as a literal at the call site) will not be caught. Same
 *       for a tags: [] array built by spreading a variable instead of
 *       literal array syntax.
 *     - False-positive risk is low: the "narrow call exists in file"
 *       escape hatch only fires when a real second revalidateTag() call
 *       is textually present, so a genuinely sole-blanket-trigger call
 *       cannot accidentally look narrow.
 *   Detects the SHAPE, not a hardcoded 'servers' string: if the tag is
 *   renamed (e.g. 'all-servers'), the "blanket" determination is
 *   recomputed live from queries.ts's actual tag declarations every run,
 *   so a rename is still caught as long as the renamed tag still covers
 *   >= threshold of call sites and no narrower tag is independently
 *   revalidated.
 *
 * CHECK B — stale force-dynamic ratchet (C-24b).
 *   Scans a fixed allowlist of routes this sprint classified as
 *   cacheable (criteria.md C-18's 15 routes,
 *   scripts/cacheable-routes-allowlist.txt). Any allowlisted route that
 *   currently carries `export const dynamic = 'force-dynamic'` is
 *   compared against a checked-in baseline file
 *   (scripts/force-dynamic-baseline.txt) recording KNOWN Wave-2 debt
 *   (owned by task T7, currently blocked by ruling D-1 pending Wave-1
 *   prod verification). The guard PASSES only when the live
 *   force-dynamic set is a SUBSET of the baseline. Growth of the
 *   baseline itself, relative to the last git-committed version, is a
 *   separate hard failure — this is what makes the baseline a one-way
 *   ratchet (ACs C-26 / T9 AC4-AC5) instead of an escape hatch a single
 *   commit could open and use at once.
 *
 * Exit code: 0 = pass, 1 = fail (one or more violations).
 */

import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = execFileSync('git', ['-C', __dirname, 'rev-parse', '--show-toplevel'])
  .toString()
  .trim();

const QUERIES_FILE = join(repoRoot, 'apps/web/lib/queries.ts');
const SCAN_ROOT = join(repoRoot, 'apps/web');
const ALLOWLIST_FILE = join(repoRoot, 'scripts/cacheable-routes-allowlist.txt');
const BASELINE_FILE = join(repoRoot, 'scripts/force-dynamic-baseline.txt');
const BASELINE_REL = 'scripts/force-dynamic-baseline.txt';

const BLANKET_SHARE_THRESHOLD = 0.5;

const relPath = (p) => p.replace(repoRoot + '/', '');

function readListFile(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

function listFilesRecursive(dir, exts, excludeSubstrings) {
  const out = [];
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    let entries;
    try {
      entries = readdirSync(d, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const full = join(d, e.name);
      if (excludeSubstrings.some((s) => full.includes(s))) continue;
      if (e.isDirectory()) stack.push(full);
      else if (exts.some((ext) => e.name.endsWith(ext))) out.push(full);
    }
  }
  return out;
}

// Split a `tags: [...]` inner-list on top-level commas, respecting quotes
// (single, double, backtick) so a comma inside a template literal doesn't
// split a tag in two. None of the current tags contain such a comma, but
// this keeps the parser honest.
function splitTagList(raw) {
  const tokens = [];
  let cur = '';
  let inQuote = null;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (inQuote) {
      cur += ch;
      if (ch === inQuote) inQuote = null;
    } else if (ch === "'" || ch === '"' || ch === '`') {
      inQuote = ch;
      cur += ch;
    } else if (ch === ',') {
      tokens.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) tokens.push(cur.trim());

  return tokens
    .filter(Boolean)
    .map((tok) => {
      const isTemplated = tok.startsWith('`') && tok.includes('${');
      let value = tok;
      if (
        (tok.startsWith("'") && tok.endsWith("'")) ||
        (tok.startsWith('"') && tok.endsWith('"')) ||
        (tok.startsWith('`') && tok.endsWith('`'))
      ) {
        value = tok.slice(1, -1);
      }
      return { raw: tok, value, isTemplated };
    });
}

function checkA() {
  const violations = [];
  if (!existsSync(QUERIES_FILE)) {
    return { violations, note: `queries.ts not found at ${relPath(QUERIES_FILE)} — Check A skipped`, blanketTags: [], totalSites: 0 };
  }
  const src = readFileSync(QUERIES_FILE, 'utf8');

  const tagsRe = /tags:\s*\[([^\]]*)\]/g;
  const callSites = [];
  let m;
  while ((m = tagsRe.exec(src))) {
    const lineNo = src.slice(0, m.index).split('\n').length;
    callSites.push({ lineNo, tags: splitTagList(m[1]) });
  }

  const totalSites = callSites.length;
  if (totalSites === 0) {
    return { violations, note: `no "tags: [...]" unstable_cache call sites found in ${relPath(QUERIES_FILE)}`, blanketTags: [], totalSites: 0 };
  }

  const tagCounts = new Map();
  for (const site of callSites) {
    const seen = new Set();
    for (const t of site.tags) {
      if (t.isTemplated) continue;
      if (seen.has(t.value)) continue;
      seen.add(t.value);
      tagCounts.set(t.value, (tagCounts.get(t.value) || 0) + 1);
    }
  }

  const blanketTags = new Map();
  for (const [tag, count] of tagCounts) {
    const share = count / totalSites;
    if (share >= BLANKET_SHARE_THRESHOLD) blanketTags.set(tag, share);
  }

  const files = listFilesRecursive(SCAN_ROOT, ['.ts', '.tsx'], [
    '/node_modules/',
    '/.next/',
    '.test.ts',
    '.test.tsx',
    '/__tests__/',
  ]);
  const callRe = /revalidateTag\(\s*(`[^`]*`|'[^']*'|"[^"]*")\s*\)/g;

  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const fileCalls = [];
    let match;
    while ((match = callRe.exec(content))) {
      const lineNo = content.slice(0, match.index).split('\n').length;
      const argRaw = match[1];
      const isTemplated = argRaw.startsWith('`') && argRaw.includes('${');
      const value = argRaw.slice(1, -1);
      fileCalls.push({ lineNo, value, isTemplated });
    }
    if (fileCalls.length === 0) continue;

    // A "narrow" call in this file: templated (per-slug/per-category style)
    // OR a static tag whose share is below the blanket threshold.
    const hasNarrowCall = fileCalls.some((c) => c.isTemplated || !blanketTags.has(c.value));

    for (const c of fileCalls) {
      if (!c.isTemplated && blanketTags.has(c.value) && !hasNarrowCall) {
        violations.push({
          file: relPath(file),
          line: c.lineNo,
          tag: c.value,
          share: blanketTags.get(c.value),
          totalSites,
        });
      }
    }
  }

  return { violations, blanketTags: [...blanketTags.entries()], totalSites };
}

function gitShow(ref, pathRel) {
  try {
    return execFileSync('git', ['-C', repoRoot, 'show', `${ref}:${pathRel}`], {
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString();
  } catch {
    return null;
  }
}

function getPriorCommittedBaseline() {
  const refEnv = process.env.GUARD_BASE_REF;
  let ref;
  if (refEnv) {
    ref = refEnv;
  } else {
    // Auto mode: if the working-tree baseline differs from what's
    // committed at HEAD, compare against HEAD (catches uncommitted/staged
    // growth pre-commit). Otherwise compare HEAD's version against
    // HEAD~1's (catches growth introduced by the most recent commit
    // itself — the case that matters for a pre-push gate, which runs
    // AFTER commit).
    const headContent = gitShow('HEAD', BASELINE_REL);
    const workingContent = existsSync(BASELINE_FILE) ? readFileSync(BASELINE_FILE, 'utf8') : null;
    if (headContent !== null && workingContent !== null && headContent.trim() !== workingContent.trim()) {
      ref = 'HEAD';
    } else {
      ref = 'HEAD~1';
    }
  }
  const content = gitShow(ref, BASELINE_REL);
  if (content === null) return null;
  return new Set(
    content
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith('#'))
  );
}

function checkB() {
  const violations = [];
  const allowlist = readListFile(ALLOWLIST_FILE);
  const baselineWorking = new Set(readListFile(BASELINE_FILE));

  const currentForceDynamic = new Set();
  const detail = [];
  for (const rel of allowlist) {
    const full = join(repoRoot, rel);
    if (!existsSync(full)) continue; // route file removed entirely — nothing to flag
    const lines = readFileSync(full, 'utf8').split('\n');
    const idx = lines.findIndex((l) => /export\s+const\s+dynamic\s*=\s*['"]force-dynamic['"]/.test(l));
    if (idx !== -1) {
      currentForceDynamic.add(rel);
      detail.push({ route: rel, line: idx + 1 });
    }
  }

  // Layer 1: current force-dynamic set (within the allowlist) must be a
  // SUBSET of the working-tree baseline.
  const notInBaseline = [...currentForceDynamic].filter((r) => !baselineWorking.has(r));
  for (const r of notInBaseline) {
    const d = detail.find((x) => x.route === r);
    violations.push({
      file: r,
      line: d ? d.line : null,
      message: `force-dynamic present on cacheable route "${r}" that is NOT covered by ${BASELINE_REL} (the known Wave-2 debt ratchet) — this is a NEW regression, not pre-existing debt.`,
    });
  }

  // Layer 2: the baseline itself must not GROW relative to the last
  // committed version. This is what stops "add the violation and add a
  // baseline entry excusing it, in the same commit" (T9 AC4/AC5).
  const priorBaseline = getPriorCommittedBaseline();
  let priorBaselineKnown = priorBaseline !== null;
  if (priorBaseline !== null) {
    const grown = [...baselineWorking].filter((r) => !priorBaseline.has(r));
    for (const r of grown) {
      violations.push({
        file: BASELINE_REL,
        line: null,
        message: `${BASELINE_REL} gained a new entry ("${r}") relative to the last git-committed version — the baseline is a one-way ratchet, it may only shrink. Marking a genuinely NEW route as cacheable-with-known-debt must land in its own prior commit, separate from any commit that introduces or changes force-dynamic on that route.`,
      });
    }
  }

  return {
    violations,
    currentForceDynamic: [...currentForceDynamic],
    baseline: [...baselineWorking],
    allowlistCount: allowlist.length,
    priorBaselineKnown,
  };
}

function main() {
  const a = checkA();
  const b = checkB();
  let failed = false;

  console.log('=== D-2 cache invalidation regression guard (task T9) ===');
  console.log('');
  console.log('--- CHECK A: blanket-tag revalidation (C-24a) ---');
  if (a.note) console.log(`  note: ${a.note}`);
  console.log(`  unstable_cache call sites in ${relPath(QUERIES_FILE)}: ${a.totalSites}`);
  console.log(
    `  blanket tags (share >= ${BLANKET_SHARE_THRESHOLD}): ${
      a.blanketTags.length ? a.blanketTags.map(([t, s]) => `'${t}' (${Math.round(s * 100)}%)`).join(', ') : 'none'
    }`
  );
  if (a.violations.length === 0) {
    console.log('  PASS: no blanket-tag revalidateTag() call found without an accompanying narrower per-slug/aggregate trigger in the same file.');
  } else {
    failed = true;
    for (const v of a.violations) {
      console.log(
        `  VIOLATION [D-2 / C-24a]: ${v.file}:${v.line} — revalidateTag('${v.tag}') is a blanket tag covering ${Math.round(
          v.share * 100
        )}% of ${v.totalSites} unstable_cache call sites in ${relPath(QUERIES_FILE)}, and no narrower per-slug/aggregate tag is independently revalidated anywhere in this file.`
      );
    }
  }

  console.log('');
  console.log('--- CHECK B: stale force-dynamic ratchet (C-24b) ---');
  console.log(`  cacheable-routes allowlist: scripts/cacheable-routes-allowlist.txt (${b.allowlistCount} routes)`);
  console.log(`  baseline (known Wave-2 debt, owned by task T7): ${BASELINE_REL} (${b.baseline.length} routes)`);
  console.log(`  currently force-dynamic among allowlisted routes: ${b.currentForceDynamic.length ? b.currentForceDynamic.join(', ') : 'none'}`);
  if (!b.priorBaselineKnown) {
    console.log('  note: no prior git-committed version of the baseline file found (bootstrap run) — baseline-growth check not evaluated this run.');
  }
  if (b.violations.length === 0) {
    console.log('  PASS: force-dynamic set is a subset of the committed baseline, and the baseline did not grow.');
  } else {
    failed = true;
    for (const v of b.violations) {
      console.log(`  VIOLATION [D-2 / C-24b]: ${v.file}${v.line ? ':' + v.line : ''} — ${v.message}`);
    }
  }

  console.log('');
  if (failed) {
    console.log('RESULT: FAIL — one or more D-2 regression checks failed. See VIOLATION lines above.');
    process.exit(1);
  } else {
    console.log('RESULT: PASS');
    process.exit(0);
  }
}

main();
