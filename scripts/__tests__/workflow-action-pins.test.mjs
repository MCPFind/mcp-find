import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '../..');
const workflowsDirectory = join(root, '.github/workflows');
const immutableSha = /^[0-9a-f]{40}$/i;

const approvedActions = new Set([
  'actions/checkout',
  'actions/setup-node',
  'pnpm/action-setup',
]);
const releaseVersion = /^v\d+(?:\.\d+){0,2}(?:[-+][\w.-]+)?$/;

function workflowUses(source) {
  return [...source.matchAll(/^\s*(?:-\s*)?uses:\s*([^\s#]+)(?:\s+#\s*(.+))?\s*$/gm)]
    .map((match) => ({ reference: match[1], version: match[2]?.trim() }));
}

function isPinnedOrLocal(reference) {
  if (reference.startsWith('./')) return true;

  const at = reference.lastIndexOf('@');
  return at > 0 && immutableSha.test(reference.slice(at + 1));
}

describe('workflow action pinning', () => {
  it('pins every external workflow action to a full commit SHA', () => {
    const mutable = [];

    for (const filename of readdirSync(workflowsDirectory).filter((name) => /\.ya?ml$/i.test(name))) {
      const source = readFileSync(join(workflowsDirectory, filename), 'utf8');
      for (const { reference } of workflowUses(source)) {
        if (!isPinnedOrLocal(reference)) mutable.push(`${filename}: ${reference}`);
      }
    }

    expect(mutable).toEqual([]);
  });

  it('allows only reviewed action names and Dependabot-readable release comments', () => {
    const seen = new Map();

    for (const filename of readdirSync(workflowsDirectory).filter((name) => /\.ya?ml$/i.test(name))) {
      const source = readFileSync(join(workflowsDirectory, filename), 'utf8');
      for (const action of workflowUses(source)) {
        if (action.reference.startsWith('./')) continue;
        const at = action.reference.lastIndexOf('@');
        const name = action.reference.slice(0, at);
        const sha = action.reference.slice(at + 1);

        expect(approvedActions, `${filename} uses an unreviewed external action: ${name}`).toContain(name);
        expect(sha).toMatch(immutableSha);
        expect(action.version).toMatch(releaseVersion);
        seen.set(name, true);
      }
    }

    expect([...seen.keys()].sort()).toEqual([...approvedActions].sort());
  });

  it('allows local actions and rejects mutable tags, branches, and short SHAs', () => {
    expect(isPinnedOrLocal('./.github/actions/validate')).toBe(true);
    expect(isPinnedOrLocal('actions/checkout@v4')).toBe(false);
    expect(isPinnedOrLocal('owner/action@main')).toBe(false);
    expect(isPinnedOrLocal('actions/checkout@11d5960')).toBe(false);
    expect(isPinnedOrLocal('actions/checkout@11d5960a326750d5838078e36cf38b85af677262')).toBe(true);
    expect(releaseVersion.test('v4.4.0')).toBe(true);
    expect(releaseVersion.test('main')).toBe(false);
  });
});
