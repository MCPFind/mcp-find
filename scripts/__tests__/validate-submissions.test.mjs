import { describe, it, expect } from 'vitest';
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import {
  VALID_CATEGORIES,
  VALID_PACKAGE_TYPES,
  validateDocument,
  collectSubmissionFiles,
  renderSummary,
  REGISTRY_FILE,
  SUBMISSIONS_DIR,
} from '../validate-submissions.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '../..');

function validEntry(overrides = {}) {
  return {
    name: 'Example MCP Server',
    github_url: 'https://github.com/owner/repo',
    package_name: 'example-mcp-server',
    description: 'A perfectly reasonable description that clears the length floor.',
    package_type: 'npm',
    category: 'devtools',
    ...overrides,
  };
}

function doc(...servers) {
  return { servers };
}

describe('category list stays in sync with the schema', () => {
  // The validator cannot import packages/shared/src/categories.ts (it is TS and
  // the workflow runs it with bare node), so the list is duplicated. This test
  // is the thing that stops the duplicate from drifting — which is exactly what
  // went wrong before: the old inline validator in validate-pr.yml listed 11
  // categories, omitted nine real ones, and accepted `crm`, which is not in the
  // schema at all.
  it('matches CATEGORIES in packages/shared/src/categories.ts exactly', () => {
    const src = readFileSync(join(REPO_ROOT, 'packages/shared/src/categories.ts'), 'utf-8');
    const block = src.match(/export const CATEGORIES = \[([\s\S]*?)\] as const;/);
    expect(block, 'could not locate the CATEGORIES array in categories.ts').toBeTruthy();

    const schemaCategories = [...block[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

    expect(schemaCategories.length).toBeGreaterThan(0);
    expect(VALID_CATEGORIES).toEqual(schemaCategories);
  });

  it('does not accept the legacy values that are absent from the schema', () => {
    expect(VALID_CATEGORIES).not.toContain('crm');
    expect(VALID_CATEGORIES).not.toContain('maps');
  });
});

describe('validateDocument', () => {
  it('accepts a fully populated valid entry', () => {
    expect(validateDocument('submissions/example.yml', doc(validEntry()))).toEqual([]);
  });

  it('accepts an entry with the optional fields omitted', () => {
    const entry = validEntry();
    delete entry.package_type;
    delete entry.category;
    expect(validateDocument('submissions/example.yml', doc(entry))).toEqual([]);
  });

  it('rejects a document with no servers array', () => {
    const errors = validateDocument('submissions/example.yml', { notServers: [] });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('servers');
  });

  it('rejects an empty servers array', () => {
    const errors = validateDocument('submissions/example.yml', doc());
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('empty');
  });

  it('rejects null and undefined documents', () => {
    expect(validateDocument('x.yml', null)).toHaveLength(1);
    expect(validateDocument('x.yml', undefined)).toHaveLength(1);
  });

  for (const field of ['name', 'github_url', 'package_name', 'description']) {
    it(`reports a missing ${field}`, () => {
      const entry = validEntry();
      delete entry[field];
      const errors = validateDocument('submissions/example.yml', doc(entry));
      expect(errors.some((e) => e.includes(field))).toBe(true);
    });
  }

  it('rejects a github_url that is not a plain owner/repo URL', () => {
    const errors = validateDocument(
      'submissions/example.yml',
      doc(validEntry({ github_url: 'https://github.com/owner/repo/tree/main/packages/x' }))
    );
    expect(errors.some((e) => e.includes('github_url'))).toBe(true);
  });

  it('accepts a github_url with a trailing slash', () => {
    expect(
      validateDocument('submissions/example.yml', doc(validEntry({ github_url: 'https://github.com/owner/repo/' })))
    ).toEqual([]);
  });

  it('rejects a description under 20 characters', () => {
    const errors = validateDocument('submissions/example.yml', doc(validEntry({ description: 'Too short.' })));
    expect(errors.some((e) => e.includes('20 characters'))).toBe(true);
  });

  it('rejects an unknown package_type', () => {
    const errors = validateDocument('submissions/example.yml', doc(validEntry({ package_type: 'cargo' })));
    expect(errors.some((e) => e.includes('package_type'))).toBe(true);
  });

  it('accepts every valid package_type', () => {
    for (const t of VALID_PACKAGE_TYPES) {
      expect(validateDocument('x.yml', doc(validEntry({ package_type: t })))).toEqual([]);
    }
  });

  it('accepts every valid category', () => {
    for (const c of VALID_CATEGORIES) {
      expect(validateDocument('x.yml', doc(validEntry({ category: c })))).toEqual([]);
    }
  });

  it('rejects developer-tools and names the alternatives', () => {
    // A real open PR used `developer-tools`. The error must list what to use.
    const errors = validateDocument('submissions/example.yml', doc(validEntry({ category: 'developer-tools' })));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('developer-tools');
    expect(errors[0]).toContain('devtools');
  });

  it('rejects crm, which the old inline validator wrongly allowed', () => {
    const errors = validateDocument('submissions/example.yml', doc(validEntry({ category: 'crm' })));
    expect(errors.some((e) => e.includes('category'))).toBe(true);
  });

  it('accepts the categories the old inline validator wrongly rejected', () => {
    for (const c of ['monitoring', 'security', 'testing', 'analytics', 'automation', 'media', 'documentation', 'social', 'ecommerce']) {
      expect(validateDocument('x.yml', doc(validEntry({ category: c })))).toEqual([]);
    }
  });

  it('reports every bad entry in a multi-entry document, not just the first', () => {
    const errors = validateDocument(
      'community-servers.yml',
      doc(validEntry(), validEntry({ category: 'nope' }), validEntry({ description: 'short' }))
    );
    expect(errors).toHaveLength(2);
    expect(errors[0]).toContain('entry 2');
    expect(errors[1]).toContain('entry 3');
  });

  it('does not throw on a non-object entry', () => {
    const errors = validateDocument('x.yml', doc('just a string'));
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('not a mapping');
  });
});

describe('the checked-in registry file is valid', () => {
  it('community-servers.yml passes validation', async () => {
    // Parsed without the yaml package so the test has no extra dependency:
    // this asserts the file the repo actually ships is well-formed per the
    // same rules a contributor's PR is held to.
    const YAML = await import('node:module').then(({ createRequire }) => {
      try {
        return createRequire(import.meta.url)('yaml');
      } catch {
        return null;
      }
    });
    if (!YAML) {
      // yaml is a CI-time install; skip rather than fail a local run.
      return;
    }
    const data = YAML.parse(readFileSync(join(REPO_ROOT, REGISTRY_FILE), 'utf-8'));
    expect(validateDocument(REGISTRY_FILE, data)).toEqual([]);
  });
});

describe('collectSubmissionFiles', () => {
  function fixture() {
    const root = mkdtempSync(join(tmpdir(), 'mcpfind-submissions-'));
    return root;
  }

  it('returns an empty list when neither path exists', () => {
    expect(collectSubmissionFiles(fixture())).toEqual([]);
  });

  it('finds the registry file on its own', () => {
    const root = fixture();
    writeFileSync(join(root, REGISTRY_FILE), 'servers: []\n');
    expect(collectSubmissionFiles(root)).toEqual([REGISTRY_FILE]);
  });

  it('finds per-server files in the submissions directory', () => {
    const root = fixture();
    mkdirSync(join(root, SUBMISSIONS_DIR));
    writeFileSync(join(root, SUBMISSIONS_DIR, 'b-server.yml'), 'servers: []\n');
    writeFileSync(join(root, SUBMISSIONS_DIR, 'a-server.yaml'), 'servers: []\n');
    expect(collectSubmissionFiles(root)).toEqual([
      `${SUBMISSIONS_DIR}/a-server.yaml`,
      `${SUBMISSIONS_DIR}/b-server.yml`,
    ]);
  });

  it('ignores non-YAML files such as the directory README', () => {
    const root = fixture();
    mkdirSync(join(root, SUBMISSIONS_DIR));
    writeFileSync(join(root, SUBMISSIONS_DIR, 'README.md'), '# docs\n');
    writeFileSync(join(root, SUBMISSIONS_DIR, 'ok.yml'), 'servers: []\n');
    expect(collectSubmissionFiles(root)).toEqual([`${SUBMISSIONS_DIR}/ok.yml`]);
  });

  it('returns both paths together, registry first', () => {
    const root = fixture();
    writeFileSync(join(root, REGISTRY_FILE), 'servers: []\n');
    mkdirSync(join(root, SUBMISSIONS_DIR));
    writeFileSync(join(root, SUBMISSIONS_DIR, 'x.yml'), 'servers: []\n');
    expect(collectSubmissionFiles(root)).toEqual([REGISTRY_FILE, `${SUBMISSIONS_DIR}/x.yml`]);
  });
});

describe('renderSummary', () => {
  it('reports success without listing errors', () => {
    const out = renderSummary(['community-servers.yml'], []);
    expect(out).toContain('Validation passed');
    expect(out).not.toContain('Validation failed');
  });

  it('lists every error on failure', () => {
    const out = renderSummary(['submissions/x.yml'], ['first problem', 'second problem']);
    expect(out).toContain('Validation failed');
    expect(out).toContain('2 problems found');
    expect(out).toContain('first problem');
    expect(out).toContain('second problem');
  });

  it('always names the files it checked', () => {
    const out = renderSummary(['community-servers.yml', 'submissions/x.yml'], []);
    expect(out).toContain('community-servers.yml');
    expect(out).toContain('submissions/x.yml');
  });
});
