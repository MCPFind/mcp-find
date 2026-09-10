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
 *   is a VIOLATION unless that exact file/tag pair carries an entry in
 *   scripts/cache-invalidation-allowlist.txt, and the tag's live fan-out
 *   is still within the cap that entry records.
 *
 *   HARDENED 2026-09-03 (task 32). The prior rule exempted a blanket-tag
 *   call whenever the SAME file contained any narrower revalidateTag()
 *   call — a templated `server-${slug}`, or a static tag below the
 *   threshold. That was an escape hatch, not a check: presence of a narrow
 *   call proves nothing about whether the blanket call is scoped. The two
 *   can sit on different branches, and even on the same branch the blanket
 *   call still fires wave-wide. In practice it meant
 *   apps/web/app/api/revalidate/route.ts's unconditional
 *   revalidateTag('servers-listing') was never examined, because the
 *   per-slug loop three lines above it satisfied the test. Exemptions are
 *   now explicit, checked in, and ratcheted.
 *
 *   The fan-out cap is the part that catches a FUTURE regression: an
 *   aggregate tag becomes wave-wide by being declared on more
 *   unstable_cache call sites, not by the revalidateTag() call changing.
 *   Exceeding the recorded cap fails the gate.
 *
 *   This is a textual/static heuristic, not a real TypeScript parser.
 *   Comments are stripped before matching (see stripComments) so prose
 *   quoting a call is not counted as one. Stated tradeoff:
 *     - False-negative risk: a call site that builds its revalidateTag
 *       argument through an indirection this regex can't see (e.g. a tag
 *       string assembled in a helper function and imported, rather than
 *       written as a literal at the call site) will not be caught. Same
 *       for a tags: [] array built by spreading a variable instead of
 *       literal array syntax.
 *     - Reachability is NOT modelled: the guard knows a tag's fan-out
 *       across queries.ts, not which routes render which query. Whether a
 *       given tag reaches /servers/[slug] is a question for review, which
 *       is what the acknowledgement entry's comment is for.
 *   Detects the SHAPE, not a hardcoded 'servers' string: if the tag is
 *   renamed (e.g. 'all-servers'), the "blanket" determination is
 *   recomputed live from queries.ts's actual tag declarations every run,
 *   and the rename lands with no acknowledgement entry, so it fails.
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

import { CDN_SITEMAP_ROUTES, sitemapCacheViolations } from './sitemap-cache-contract.mjs';
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
const CACHE_ACK_REL = 'scripts/cache-invalidation-allowlist.txt';
const CACHE_ACK_FILE = join(repoRoot, CACHE_ACK_REL);

const BLANKET_SHARE_THRESHOLD = 0.5;

const relPath = (p) => p.replace(repoRoot + '/', '');

function readListFile(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));
}

// Blank out `//` and block comments so the call-site regexes below never
// match prose. route.ts's own header comment quotes
// `revalidateTag('servers')` while documenting the T1 fix — without this
// the guard reports a call site that does not exist. Newlines are
// preserved so reported line numbers stay accurate, and quoted strings are
// skipped so a `//` inside a URL literal is not mistaken for a comment.
function stripComments(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    const next = src[i + 1];
    if (ch === '/' && next === '/') {
      while (i < src.length && src[i] !== '\n') {
        out += ' ';
        i++;
      }
    } else if (ch === '/' && next === '*') {
      out += '  ';
      i += 2;
      while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) {
        out += src[i] === '\n' ? '\n' : ' ';
        i++;
      }
      out += '  ';
      i += 2;
    } else if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      out += ch;
      i++;
      while (i < src.length) {
        if (src[i] === '\\') {
          out += src[i] + (src[i + 1] ?? '');
          i += 2;
          continue;
        }
        out += src[i];
        if (src[i] === quote) {
          i++;
          break;
        }
        i++;
      }
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

// Parse the blanket-tag acknowledgement file. One entry per line:
//   <repo-relative file>::<tag>::<max unstable_cache sites declaring that tag>
// The third field is a fan-out cap, not decoration: it records how many
// unstable_cache call sites in queries.ts were declaring the tag when the
// exemption was granted. If a later change spreads that tag to MORE call
// sites — which is exactly how an aggregate tag turns into a wave-wide one
// — the recorded cap is exceeded and the guard fails.
function parseCacheAck(text) {
  const out = new Map();
  if (text === null || text === undefined) return out;
  for (const line of text.split('\n')) {
    const l = line.trim();
    if (!l || l.startsWith('#')) continue;
    const parts = l.split('::').map((p) => p.trim());
    if (parts.length !== 3) continue;
    const [file, tag, cap] = parts;
    const maxSites = Number.parseInt(cap, 10);
    if (!file || !tag || !Number.isInteger(maxSites)) continue;
    out.set(`${file}::${tag}`, { file, tag, maxSites });
  }
  return out;
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
  const src = stripComments(readFileSync(QUERIES_FILE, 'utf8'));

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

  const ack = parseCacheAck(
    existsSync(CACHE_ACK_FILE) ? readFileSync(CACHE_ACK_FILE, 'utf8') : null
  );
  const ackUsed = new Set();

  const files = listFilesRecursive(SCAN_ROOT, ['.ts', '.tsx'], [
    '/node_modules/',
    '/.next/',
    '.test.ts',
    '.test.tsx',
    '/__tests__/',
  ]);
  const callRe = /revalidateTag\(\s*(`[^`]*`|'[^']*'|"[^"]*")\s*\)/g;

  for (const file of files) {
    const content = stripComments(readFileSync(file, 'utf8'));
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

    // Task 32 (2026-09-03): the old rule exempted a blanket-tag call
    // whenever ANY narrower revalidateTag() call existed elsewhere in the
    // same file. That exemption is what let
    // apps/web/app/api/revalidate/route.ts::POST pass while calling
    // revalidateTag('servers-listing') unconditionally — the per-slug
    // `server-${slug}` loop directly above it satisfied the "narrow call
    // present" test, so the aggregate call was never examined. Presence of
    // a narrow call in the same file proves nothing about whether the
    // blanket call is scoped: the two can sit on different branches, and
    // even on the same branch the blanket call still fires wave-wide.
    // The exemption is now explicit and checked-in instead of inferred.
    for (const c of fileCalls) {
      if (c.isTemplated) continue;
      if (!blanketTags.has(c.value)) continue;

      const rel = relPath(file);
      const key = `${rel}::${c.value}`;
      const share = blanketTags.get(c.value);
      const currentSites = tagCounts.get(c.value) || 0;
      const entry = ack.get(key);

      if (!entry) {
        violations.push({
          file: rel,
          line: c.lineNo,
          message:
            `revalidateTag('${c.value}') is a blanket tag covering ${Math.round(share * 100)}% ` +
            `(${currentSites}/${totalSites}) of the unstable_cache call sites in ` +
            `${relPath(QUERIES_FILE)}, and carries no acknowledgement entry in ${CACHE_ACK_REL}. ` +
            `A blanket tag reaches every page whose render touches ANY of those call sites — ` +
            `including nested Server Components on routes that look unrelated. Either scope the ` +
            `call to a narrower tag, or add the line ` +
            `"${key}::${currentSites}" to ${CACHE_ACK_REL} with a comment stating why the ` +
            `wave-wide bust is intended.`,
        });
        continue;
      }

      ackUsed.add(key);

      if (currentSites > entry.maxSites) {
        violations.push({
          file: rel,
          line: c.lineNo,
          message:
            `revalidateTag('${c.value}') is acknowledged in ${CACHE_ACK_REL} at a fan-out cap of ` +
            `${entry.maxSites} unstable_cache call sites, but the tag is now declared on ` +
            `${currentSites} call sites in ${relPath(QUERIES_FILE)}. The tag's blast radius GREW ` +
            `since the exemption was granted — that is the wave-wide-busting regression this gate ` +
            `exists to catch. Re-scope the new call site(s), or raise the cap in its own commit ` +
            `with a stated justification.`,
        });
      }
    }
  }

  // Ratchet: the acknowledgement file may only shrink. A new entry, or a
  // raised fan-out cap, must land in a commit of its own — it can never
  // ride along in the same commit as the change it excuses. Same one-way
  // discipline CHECK B applies to the force-dynamic baseline.
  const priorAckText = getPriorCommittedText(CACHE_ACK_REL, CACHE_ACK_FILE);
  const ackRatchetKnown = priorAckText !== null;
  if (ackRatchetKnown) {
    const priorAck = parseCacheAck(priorAckText);
    for (const [key, entry] of ack) {
      const prior = priorAck.get(key);
      if (!prior) {
        violations.push({
          file: CACHE_ACK_REL,
          line: null,
          message:
            `gained a new entry ("${key}") relative to the last git-committed version — the ` +
            `acknowledgement list is a one-way ratchet, it may only shrink. Granting a NEW ` +
            `blanket-tag exemption must land in its own prior commit, separate from any commit ` +
            `that introduces the call it excuses.`,
        });
      } else if (entry.maxSites > prior.maxSites) {
        violations.push({
          file: CACHE_ACK_REL,
          line: null,
          message:
            `raised the fan-out cap for "${key}" from ${prior.maxSites} to ${entry.maxSites} ` +
            `relative to the last git-committed version — caps are a one-way ratchet, they may ` +
            `only shrink.`,
        });
      }
    }
  }

  const ackStale = [...ack.keys()].filter((k) => !ackUsed.has(k));

  return {
    violations,
    blanketTags: [...blanketTags.entries()],
    totalSites,
    tagCounts: [...tagCounts.entries()],
    ackEntries: [...ack.values()],
    ackStale,
    ackRatchetKnown,
  };
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

// Shared ref resolution for both one-way ratchets (CHECK A's blanket-tag
// acknowledgement list and CHECK B's force-dynamic baseline). Returns the
// file's content at the comparison ref, or null when no prior committed
// version exists (bootstrap run — the ratchet arms on the first commit
// that carries the file).
function getPriorCommittedText(pathRel, workingFilePath) {
  const refEnv = process.env.GUARD_BASE_REF;
  let ref;
  if (refEnv) {
    ref = refEnv;
  } else {
    const headContent = gitShow('HEAD', pathRel);
    const workingContent = existsSync(workingFilePath)
      ? readFileSync(workingFilePath, 'utf8')
      : null;
    if (
      headContent !== null &&
      workingContent !== null &&
      headContent.trim() !== workingContent.trim()
    ) {
      ref = 'HEAD';
    } else {
      ref = 'HEAD~1';
    }
  }
  return gitShow(ref, pathRel);
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
  // Sitemap handlers use explicit CDN caching instead of build-time ISR.
  // Preserve a narrow executable cache contract, not a blanket exemption.
  const violations = sitemapCacheViolations(repoRoot);
  const allowlist = readListFile(ALLOWLIST_FILE);
  const baselineWorking = new Set(readListFile(BASELINE_FILE));

  const currentForceDynamic = new Set();
  const detail = [];
  for (const rel of allowlist) {
    if (CDN_SITEMAP_ROUTES.includes(rel)) continue;
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
  console.log(
    `  acknowledged blanket-tag call sites: ${CACHE_ACK_REL} (${(a.ackEntries || []).length} entries)`
  );
  for (const e of a.ackEntries || []) {
    const live = (a.tagCounts || []).find(([t]) => t === e.tag);
    console.log(
      `    - ${e.file} :: '${e.tag}' :: cap ${e.maxSites} (live: ${live ? live[1] : 0} call sites)`
    );
  }
  if ((a.ackStale || []).length) {
    console.log(
      `  note: acknowledgement entries matching no live blanket-tag call (remove them): ${a.ackStale.join(', ')}`
    );
  }
  if (a.totalSites > 0 && !a.ackRatchetKnown) {
    console.log(
      `  note: no prior git-committed version of ${CACHE_ACK_REL} found (bootstrap run) — the acknowledgement-growth ratchet arms on the first commit that carries this file.`
    );
  }
  if (a.violations.length === 0) {
    console.log('  PASS: every blanket-tag revalidateTag() call is explicitly acknowledged, and no acknowledged tag has grown its fan-out.');
  } else {
    failed = true;
    for (const v of a.violations) {
      console.log(`  VIOLATION [D-2 / C-24a]: ${v.file}${v.line ? ':' + v.line : ''} — ${v.message}`);
    }
  }

  console.log('');
  console.log('--- CHECK B: stale force-dynamic ratchet (C-24b) ---');
  console.log(`  cacheable-routes allowlist: scripts/cacheable-routes-allowlist.txt (${b.allowlistCount} routes)`);
  console.log(`  sitemap routes: ${CDN_SITEMAP_ROUTES.length} explicit CDN/cache contracts verified separately`);
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
