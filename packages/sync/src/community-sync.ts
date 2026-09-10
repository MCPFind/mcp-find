/**
 * Community submission ingest.
 *
 * WHY THIS EXISTS: until now, merging a submission PR did nothing at all.
 * `SELECT source, count(*) FROM servers` returned exactly one row —
 * `registry | 28554`. Zero community rows had ever existed. The data model
 * anticipated them (packages/shared/src/types.ts declares
 * `source: 'registry' | 'community'`), the PR check validated them, the /submit
 * form generated them, and nothing ever wrote them. A contributor opened a PR,
 * a maintainer merged it, and the server never appeared in the directory. No
 * error, no log line, no row.
 *
 * WHY NIGHTLY, NOT MERGE-TIME: this package already holds the Supabase service
 * role key through the existing Actions secrets on the daily sync workflow.
 * Ingesting here adds no new secret surface and keeps write credentials out of
 * PR-triggered workflows, which is important because almost every submission
 * arrives as a `pull_request` from a fork.
 *
 * THE RULE THIS STAGE IS BUILT AROUND: an entry that is not written must say
 * so. Every skip below — invalid entry, registry-owned slug, slug collision,
 * database refusal — is logged with enough identity to act on, and every one
 * except the registry-owned case is surfaced as an error on the sync_log row.
 * Silent drops are what cost this project five months of dead enrichment and
 * ~700 rows a sync; this file does not get to reintroduce that shape.
 */
import { changedRows } from './write-changes';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { SupabaseClient } from '@supabase/supabase-js';
import {
  generateSlug,
  admitBySlug,
  upsertBatchWithBisect,
  reportSkipped,
  type SkippedRow,
} from './slug-upsert';

const LOG_PREFIX = '[Community Sync]';

/** Marks the repository root. See resolveRepoRoot for why cwd will not do. */
const ROOT_MARKER = 'pnpm-workspace.yaml';

/** The shared rule set, loaded from the repo at runtime. See loadValidator. */
const VALIDATOR_PATH = 'scripts/lib/submission-validation.mjs';

/**
 * The slice of scripts/lib/submission-validation.mjs this stage uses.
 *
 * Declared locally rather than imported as types because that module is plain
 * ESM JavaScript living outside this package's rootDir — it has to be, since
 * the PR check runs it under bare `node` with no workspace install and no
 * TypeScript build. This is a type signature, not a second copy of the rules;
 * the rules are loaded from that one file at runtime.
 */
interface SubmissionValidator {
  collectSubmissionFiles(root: string): string[];
  validateShape(file: string, data: unknown, options?: { allowEmpty?: boolean }): string[];
  validateEntry(entry: unknown): string[];
  entryLabel(file: string, index: number): string;
}

/** A submission entry as it appears in YAML, before validation. */
interface SubmissionEntry {
  name?: string;
  github_url?: string;
  package_name?: string;
  description?: string;
  package_type?: string;
  category?: string;
}

/** A community row staged for upsert. */
interface CommunityRecord {
  id: string;
  slug: string;
  name: string;
  description: string;
  version: null;
  source: 'community';
  package_name: string;
  package_type: string | null;
  package_url: null;
  category?: string;
  has_tools: boolean;
  has_resources: boolean;
  has_prompts: boolean;
  tool_count: number;
  github_url: string;
  is_official: boolean;
  registry_status: 'active';
  registry_tags: string[];
  last_synced_at: string;
  /** The intake file this row came from. Not a column — stripped before write. */
  sourceFile: string;
}

export interface CommunitySyncResult {
  /** Rows actually written with source: 'community'. */
  ingested: number;
  /** Entries correctly declined because the registry already owns their slug. */
  registryOwned: number;
  /** Entries that should have been written and were not. */
  skipped: SkippedRow[];
  /** Human-readable failures, destined for sync_log.errors. */
  errors: string[];
  /**
   * True when this stage's output cannot be trusted as complete: an entry a
   * maintainer merged is missing from the directory, or the stage could not
   * run. The pipeline refuses to record the run as 'completed'.
   */
  fatal: boolean;
}

export interface CommunitySyncOptions {
  /** Repository root. Defaults to the discovered root; tests pass a fixture. */
  root?: string;
}

/**
 * Walk up from `startDir` until the workspace marker appears.
 *
 * process.cwd() is deliberately NOT used. The daily workflow invokes this via
 * `pnpm --filter @mcpfind/sync run start`, which sets cwd to packages/sync —
 * so community-servers.yml and submissions/ are two levels above it. Walking
 * for a marker is also depth-independent, which keeps the lookup correct
 * whether this module runs from src/ under tsx or from dist/ after a build.
 */
export function resolveRepoRoot(startDir: string): string | null {
  let dir = resolve(startDir);
  for (;;) {
    if (existsSync(join(dir, ROOT_MARKER))) return dir;
    const parent = dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

/**
 * Load the shared rule set from the repository at runtime.
 *
 * A static import is not possible: the module is plain .mjs outside this
 * package's rootDir, and a relative import would emit a path into dist/ that
 * points somewhere that does not exist. Loading it by absolute path from the
 * already-resolved repo root keeps one copy of the rules and works identically
 * under tsx and under node.
 */
async function loadValidator(root: string): Promise<SubmissionValidator> {
  const path = join(root, VALIDATOR_PATH);
  if (!existsSync(path)) {
    throw new Error(
      `submission validator not found at ${path} — the community ingest and the PR check ` +
        `must share one rule set, so this stage refuses to validate with a local copy`
    );
  }
  return (await import(pathToFileURL(path).href)) as SubmissionValidator;
}

/**
 * Stable primary key for a community row, derived from the repository URL.
 *
 * The URL is the one field that identifies the project rather than describing
 * it: a submitter may retitle their server, and a rename must update the row
 * rather than mint a second one. The `community:` prefix cannot collide with a
 * registry id, which is always a reverse-DNS name such as
 * `io.github.owner/repo`.
 */
export function communityId(githubUrl: string): string {
  const path = githubUrl
    .replace(/^https:\/\/github\.com\//i, '')
    .replace(/\/+$/, '')
    .toLowerCase();
  return `community:${path}`;
}

function toRecord(entry: SubmissionEntry, file: string): CommunityRecord {
  const name = String(entry.name);
  const githubUrl = String(entry.github_url).replace(/\/+$/, '');

  const record: CommunityRecord = {
    id: communityId(githubUrl),
    slug: generateSlug(name),
    name,
    description: String(entry.description),
    version: null,
    source: 'community',
    package_name: String(entry.package_name),
    package_type: entry.package_type ?? null,
    package_url: null,
    has_tools: false,
    has_resources: false,
    has_prompts: false,
    tool_count: 0,
    github_url: githubUrl,
    is_official: false,
    registry_status: 'active',
    registry_tags: [],
    last_synced_at: new Date().toISOString(),
    sourceFile: file,
  };

  // `category` is included ONLY when the submitter supplied one. Writing an
  // explicit null every night would erase whatever stage 3 assigned the night
  // before, so the two stages would fight forever and the category column
  // would flicker. Absent here means "categorizer's call", which is the same
  // reason registry-sync.ts omits the column entirely.
  if (entry.category) record.category = entry.category;

  return record;
}

/**
 * Which of these slugs are already held by a registry row.
 *
 * Registry wins on conflict: those entries are self-published by the server's
 * own author through the official registry, which is better data than a
 * third-party submission, and overwriting one would silently downgrade the
 * catalogue.
 */
async function findRegistryOwnedSlugs(
  supabase: SupabaseClient<any, any, any>, // eslint-disable-line @typescript-eslint/no-explicit-any
  slugs: string[]
): Promise<Map<string, string>> {
  const owned = new Map<string, string>();
  const CHUNK = 200;

  for (let i = 0; i < slugs.length; i += CHUNK) {
    const chunk = slugs.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('servers')
      .select('id,slug,source')
      .in('slug', chunk);

    if (error) {
      throw new Error(`could not read existing slugs to arbitrate ownership: ${error.message}`);
    }

    for (const row of (data ?? []) as Array<{ id: string; slug: string; source: string }>) {
      if (row.source === 'registry') owned.set(row.slug, row.id);
    }
  }

  return owned;
}

/**
 * Read both intake paths, validate every entry, and upsert the survivors with
 * source: 'community'.
 */
export async function syncCommunitySubmissions(
  supabase: SupabaseClient<any, any, any>, // eslint-disable-line @typescript-eslint/no-explicit-any
  options: CommunitySyncOptions = {}
): Promise<CommunitySyncResult> {
  const result: CommunitySyncResult = {
    ingested: 0,
    registryOwned: 0,
    skipped: [],
    errors: [],
    fatal: false,
  };

  const root = options.root ?? resolveRepoRoot(dirname(fileURLToPath(import.meta.url)));
  if (!root) {
    const message = `community ingest could not locate the repository root (no ${ROOT_MARKER} above this module)`;
    console.error(`${LOG_PREFIX} ${message}`);
    result.errors.push(message);
    result.fatal = true;
    return result;
  }

  let validator: SubmissionValidator;
  try {
    validator = await loadValidator(root);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${LOG_PREFIX} ${message}`);
    result.errors.push(message);
    result.fatal = true;
    return result;
  }

  // Both intake paths, globbed rather than named: submissions/ is written one
  // file per server by the prefilled GitHub link the /submit form generates,
  // so its contents cannot be known ahead of time.
  const files = validator.collectSubmissionFiles(root);
  if (files.length === 0) {
    console.log(`${LOG_PREFIX} No intake files found under ${root} — nothing to ingest.`);
    return result;
  }
  console.log(`${LOG_PREFIX} Reading ${files.length} intake file(s): ${files.join(', ')}`);

  const records: CommunityRecord[] = [];

  for (const file of files) {
    let data: unknown;
    try {
      data = parseYaml(readFileSync(join(root, file), 'utf-8'));
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      const message = `${file}: could not parse YAML — ${detail}`;
      console.error(`${LOG_PREFIX} MALFORMED file="${file}" — ${detail}`);
      result.errors.push(message);
      result.fatal = true;
      continue;
    }

    // allowEmpty: an emptied file has no submission that could fail to appear,
    // so reddening a 28,000-row sync over it would be a false alarm. A
    // MALFORMED file is a different thing and still fails.
    const shapeErrors = validator.validateShape(file, data, { allowEmpty: true });
    if (shapeErrors.length > 0) {
      for (const detail of shapeErrors) {
        console.error(`${LOG_PREFIX} MALFORMED file="${file}" — ${detail}`);
        result.errors.push(detail);
      }
      result.fatal = true;
      continue;
    }

    const entries = (data as { servers: unknown[] }).servers;
    for (const [index, entry] of entries.entries()) {
      const label = validator.entryLabel(file, index);
      const candidate = (entry ?? {}) as SubmissionEntry;
      const entryName =
        typeof candidate.name === 'string' && candidate.name ? candidate.name : '(unnamed)';

      const entryErrors = validator.validateEntry(entry);
      if (entryErrors.length > 0) {
        // Named, not dropped. A merged entry that never reaches the table is
        // exactly the silence this stage exists to end, so it costs the run
        // its 'completed' status until somebody fixes or removes the file.
        for (const detail of entryErrors) {
          console.error(
            `${LOG_PREFIX} SKIPPED invalid entry — file="${file}" entry="${entryName}" reason: ${detail}`
          );
          result.errors.push(`${label} ("${entryName}"): ${detail}`);
        }
        result.fatal = true;
        continue;
      }

      records.push(toRecord(candidate, file));
    }
  }

  if (records.length === 0) {
    console.log(`${LOG_PREFIX} No valid entries to ingest.`);
    reportSkipped(result.skipped, LOG_PREFIX);
    return result;
  }

  // Deduplicate on id — the same repository submitted through both intake
  // paths, or twice in one file. Last occurrence wins, matching registry-sync.
  const deduped = Object.values(
    records.reduce<Record<string, CommunityRecord>>((acc, r) => {
      acc[r.id] = r;
      return acc;
    }, {})
  );

  // Run-wide slug arbitration, reusing the registry sync's own code (9947d94):
  // two different submissions whose names slugify identically cannot both hold
  // servers.slug, and sending both to one upsert would abort the statement.
  const admitted = admitBySlug(deduped, new Map<string, string>(), result.skipped, LOG_PREFIX);

  // Registry wins on conflict.
  let registryOwned: Map<string, string>;
  try {
    registryOwned = await findRegistryOwnedSlugs(
      supabase,
      admitted.map(r => r.slug)
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`${LOG_PREFIX} ${message}`);
    result.errors.push(message);
    result.fatal = true;
    return result;
  }

  const toWrite: CommunityRecord[] = [];
  for (const record of admitted) {
    const owner = registryOwned.get(record.slug);
    if (owner !== undefined) {
      result.registryOwned++;
      // Not an error and not fatal: this is the designed outcome. The registry
      // entry is self-published by the server's own author, so it is better
      // data than a third-party submission of the same project.
      console.log(
        `${LOG_PREFIX} SKIPPED registry-owned slug — file="${record.sourceFile}" ` +
          `entry="${record.name}" slug="${record.slug}" submitted id="${record.id}" not written; ` +
          `registry row id="${owner}" already holds that slug and the registry is authoritative.`
      );
      continue;
    }
    toWrite.push(record);
  }

  // sourceFile is bookkeeping for the logs above, not a column on `servers`.
  const rows = toWrite.map(({ sourceFile: _sourceFile, ...row }) => row);

  result.ingested = await upsertBatchWithBisect(supabase, await changedRows(supabase, rows), result.skipped, LOG_PREFIX);

  reportSkipped(result.skipped, LOG_PREFIX);
  if (result.skipped.length > 0) {
    result.fatal = true;
    for (const row of result.skipped) {
      result.errors.push(
        `community submission not written: id="${row.id}" slug="${row.slug}" — ${row.reason}`
      );
    }
  }

  console.log(
    `${LOG_PREFIX} ${result.ingested} ingested, ${result.registryOwned} deferred to the registry, ` +
      `${result.skipped.length} not written, ${result.errors.length} error(s).`
  );

  return result;
}
