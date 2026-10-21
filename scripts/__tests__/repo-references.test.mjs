/**
 * Repo-reference regression guard.
 *
 * The codebase historically referenced the original author's repo
 * (gusmar2017 account), which no longer exists (404: the project moved to
 * the MCPFind org). Live code and docs must point at the canonical repo
 * under github.com/MCPFind.
 *
 * Runs as part of the standard `pnpm test` suite via the vitest config
 * include pattern: "../../scripts/__tests__/**\/*.test.mjs"
 *
 * Assertions:
 *   - No tracked text file references the dead gusmar2017/mcp-find host,
 *     outside docs/launch/** (historical launch copy, frozen as published).
 *   - REPO_URL in packages/shared/src/constants.ts is the canonical repo URL.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const CANONICAL_REPO_URL = "https://github.com/MCPFind/mcp-find";
// Joined at runtime so this guard does not match its own source.
const DEAD_HOST = ["gusmar2017", "mcp-find"].join("/");

/** Historical launch posts keep the links exactly as published. */
const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  ".turbo",
  "dist",
]);
const EXCLUDED_PREFIXES = [join("docs", "launch")];
const EXCLUDED_FILES = new Set([
  "pnpm-lock.yaml",
  // This guard greps for the dead host, so it necessarily names it.
  "repo-references.test.mjs",
]);
const SCANNED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".json",
  ".md",
  ".mdx",
  ".yml",
  ".yaml",
  ".txt",
  ".html",
]);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (EXCLUDED_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const rel = relative(REPO_ROOT, full);
    if (EXCLUDED_PREFIXES.some((p) => rel === p || rel.startsWith(p + "/")))
      continue;
    const st = statSync(full);
    if (st.isDirectory()) {
      yield* walk(full);
    } else if (
      SCANNED_EXTENSIONS.has(entry.slice(entry.lastIndexOf("."))) &&
      !EXCLUDED_FILES.has(entry)
    ) {
      yield full;
    }
  }
}

describe("repo references", () => {
  it("no live file references the dead gusmar2017/mcp-find host", () => {
    const offenders = [];
    for (const file of walk(REPO_ROOT)) {
      const content = readFileSync(file, "utf8");
      if (content.includes(DEAD_HOST)) {
        offenders.push(relative(REPO_ROOT, file));
      }
    }
    expect(
      offenders,
      `dead host ${DEAD_HOST} found in: ${offenders.join(", ")}`
    ).toEqual([]);
  });

  it("REPO_URL points at the canonical MCPFind repo", () => {
    const constants = readFileSync(
      join(REPO_ROOT, "packages", "shared", "src", "constants.ts"),
      "utf8"
    );
    const match = constants.match(/REPO_URL\s*=\s*'([^']+)'/);
    expect(match, "REPO_URL export not found in constants.ts").not.toBeNull();
    expect(match[1]).toBe(CANONICAL_REPO_URL);
  });
});
