import { describe, it, expect, vi } from 'vitest';
import { changedRows } from './write-changes';
import { upsertBatchWithBisect } from './slug-upsert';
import { generateConfig } from '../../shared/src/config-generator';
import { categorizeServer } from './categorizer';

function db(data: unknown[], error: unknown = null) {
  return { from: () => ({ select: () => ({ in: async () => ({ data, error }) }) }) };
}

describe('incremental source writes', () => {
  it('does not rewrite a visited record, timestamps or enrichment-owned fields', async () => {
    const row = { id: 'a', slug: 'a', description: 'Useful', registry_tags: ['calendar'], last_synced_at: 'new', registry_updated_at: '2026-09-10T00:00:00Z' };
    const stored = { ...row, last_synced_at: 'old', registry_updated_at: '2026-09-10T00:00:00+00:00', updated_at: 'old', category: 'productivity', github_stars: 100 };
    expect(await changedRows(db([stored]) as never, [row])).toEqual([]);
  });
  it('writes only new or changed rows and advances updated_at', async () => {
    const rows = [{ id: 'a', slug: 'a', description: 'new' }, { id: 'b', slug: 'b', description: 'same' }, { id: 'c', slug: 'c', description: 'added' }];
    const result = await changedRows(db([{ ...rows[0], description: 'old' }, rows[1]]) as never, rows);
    expect(result.map(row => row.id)).toEqual(['a', 'c']);
    expect(result.every(row => !Number.isNaN(Date.parse(row.updated_at)))).toBe(true);
  });
  it('fails closed when comparisons cannot be read', async () => {
    await expect(changedRows(db([], { message: 'timeout' }) as never, [{ id: 'a', slug: 'a' }])).rejects.toThrow('Cannot compare');
  });
  it('does not bisect an infrastructure outage into one request per row', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: { code: 'PGRST000', message: 'Database unavailable' } });
    const skipped: Array<{ id: string; slug: string; reason: string }> = [];
    expect(await upsertBatchWithBisect({ from: () => ({ upsert }) } as never, [{ id: 'a', slug: 'a' }, { id: 'b', slug: 'b' }], skipped)).toBe(0);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(skipped).toHaveLength(2);
  });
});

describe('honest setup and categorization', () => {
  it('refuses to fabricate npm setup for unsupported packages', () => {
    expect(() => generateConfig({ slug: 'test', packageName: 'unknown', packageType: 'other' }, 'claude-desktop')).toThrow('Automatic configuration is unavailable');
  });
  it('keeps known calendar products out of incidental search/files categories', () => {
    expect(categorizeServer('Google Calendar MCP', 'Search files and manage calendar events', [], 'google-calendar-mcp')).toBe('productivity');
  });
});


describe('client-specific configuration contracts', () => {
  it('emits the required VS Code stdio type inside servers, preserving runtime arguments', () => {
    const output = generateConfig({ slug: 'example', packageName: '@example/server', packageType: 'npm', additionalArgs: ['--read-only'] }, 'vscode');
    expect(output.config).toEqual({ servers: { example: { type: 'stdio', command: 'npx', args: ['-y', '@example/server', '--read-only'] } } });
    expect(output.filePath.macos).toBe('.vscode/mcp.json');
  });
  it('provides a standalone Claude Code project configuration and file path on every OS', () => {
    const output = generateConfig({ slug: 'example', packageName: 'example-server', packageType: 'pypi' }, 'claude-code');
    expect(output.config).toEqual({ mcpServers: { example: { command: 'uvx', args: ['example-server'] } } });
    expect(Object.values(output.filePath)).toEqual(['.mcp.json', '.mcp.json', '.mcp.json']);
    expect(output.postInstall).toContain('project root');
  });
});
