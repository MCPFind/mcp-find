/**
 * Smoke test for scripts/check-broken-delta.mjs (F8).
 *
 * RUNNER NOTE:
 * This file IS picked up by `pnpm test` in apps/web.
 * The web vitest config (apps/web/vitest.config.ts) includes "../../scripts/__tests__/**\/*.test.mjs"
 * so this test runs as part of the standard test suite.
 *
 * F4: Tests write to temp files instead of production paths. If the process is
 * SIGKILL'd between mutation and afterEach cleanup, production is untouched.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { QUALITY_STATUS_VALUES } from "../../packages/shared/dist/types.js";
import { VALID_STATUSES as SCRIPT_VALID_STATUSES } from "../check-broken-delta.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const scriptPath = join(__dirname, "..", "check-broken-delta.mjs");
const repoRoot = join(__dirname, "..", "..");
const realMapPath = join(repoRoot, "apps", "web", "data", "quality-status-map.json");
const realSnapshotPath = join(repoRoot, ".build-state", "broken-count.json");

let tempDir;
let tempMapPath;
let tempSnapshotPath;

function runScript(mapPath, snapshotPath) {
  try {
    // task 11 / C-31..C-35: `execFileSync` with NO explicit `stdio` echoes the
    // child's stderr live to the parent (Gate 5's) terminal *in addition to*
    // populating `err.stderr` on failure — confirmed empirically. That live
    // echo is what leaked this test's synthetic negative-path diagnostics
    // ("Current BROKEN: 30", "invalid quality_status value(s)") into Gate
    // output unlabeled, indistinguishable from a real production alert, even
    // though this test PASSES and never touches production data. Passing
    // `stdio` explicitly (identical 'pipe' semantics for every fd) suppresses
    // that live echo while still fully capturing stdout/stderr into `err`
    // below — output is then only surfaced when an assertion actually fails,
    // via the `stderr: ${result.output}` messages already on the assertions
    // in this file, which is exactly where a real regression would need it.
    const stdout = execFileSync(
      process.execPath,
      [scriptPath, "--map-path", mapPath, "--state-path", snapshotPath],
      { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] },
    );
    return { exitCode: 0, output: stdout };
  } catch (err) {
    return { exitCode: err.status ?? 1, output: (err.stderr ?? "") + (err.message ?? "") };
  }
}

// ---------------------------------------------------------------------------
// Drift-defense: VALID_STATUSES in the script must match QUALITY_STATUS_VALUES
// from packages/shared/src/types.ts (the single source of truth).
// ---------------------------------------------------------------------------

describe("VALID_STATUSES drift defense", () => {
  // SCRIPT_VALID_STATUSES is now imported directly from check-broken-delta.mjs above.
  // If the script's set changes, this test will automatically catch it — no manual sync needed.

  it("script VALID_STATUSES has the same count as QUALITY_STATUS_VALUES", () => {
    expect(SCRIPT_VALID_STATUSES.size).toBe(QUALITY_STATUS_VALUES.length);
  });

  it("every value in QUALITY_STATUS_VALUES is present in VALID_STATUSES", () => {
    for (const status of QUALITY_STATUS_VALUES) {
      expect(SCRIPT_VALID_STATUSES.has(status)).toBe(true);
    }
  });

  it("every value in VALID_STATUSES is present in QUALITY_STATUS_VALUES", () => {
    const sharedSet = new Set(QUALITY_STATUS_VALUES);
    for (const status of SCRIPT_VALID_STATUSES) {
      expect(sharedSet.has(status)).toBe(true);
    }
  });
});

describe("check-broken-delta.mjs smoke tests", () => {
  beforeEach(() => {
    // Create a fresh temp dir for this test; copy production files into it
    tempDir = mkdtempSync(join(tmpdir(), "check-broken-delta-test-"));
    tempMapPath = join(tempDir, "quality-status-map.json");
    tempSnapshotPath = join(tempDir, "broken-count.json");
    writeFileSync(tempMapPath, readFileSync(realMapPath, "utf-8"));
    writeFileSync(tempSnapshotPath, readFileSync(realSnapshotPath, "utf-8"));
  });

  afterEach(() => {
    // Clean up temp dir; SIGKILL between mutation and here leaves production untouched
    try { rmSync(tempDir, { recursive: true, force: true }); } catch (_) {}
  });

  it("passes with current real data (baseline sanity)", () => {
    const result = runScript(tempMapPath, tempSnapshotPath);
    expect(result.exitCode).toBe(0);
  });

  it("exits 1 when BROKEN entries spike by >20 above snapshot (absolute threshold)", () => {
    const map = JSON.parse(readFileSync(tempMapPath, "utf-8"));
    // Inject 30 extra BROKEN entries — guaranteed to exceed the absolute threshold of 20
    for (let i = 0; i < 30; i++) {
      map[`__test-poison-broken-${i}__`] = "BROKEN";
    }
    writeFileSync(tempMapPath, JSON.stringify(map));

    const result = runScript(tempMapPath, tempSnapshotPath);
    expect(result.exitCode, `stderr: ${result.output}`).toBe(1);
    expect(result.output).toMatch(/exceeds safety threshold/i);
  });

  it("exits 1 when map contains an invalid status value (closed-enum check)", () => {
    const map = JSON.parse(readFileSync(tempMapPath, "utf-8"));
    map["__test-invalid-status__"] = "UNKNOWN_STATUS";
    writeFileSync(tempMapPath, JSON.stringify(map));

    const result = runScript(tempMapPath, tempSnapshotPath);
    expect(result.exitCode, `stderr: ${result.output}`).toBe(1);
    expect(result.output).toMatch(/invalid quality_status/i);
  });
});
