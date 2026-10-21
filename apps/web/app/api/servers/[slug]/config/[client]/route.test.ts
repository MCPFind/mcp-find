/**
 * /api/servers/[slug]/config/[client] (config generator) route tests.
 *
 * The generator endpoint promised in llms.txt had no coverage: slug/client
 * validation, 404/422/503 semantics, command building per package type,
 * the VS Code stdio discriminator and package-name trimming.
 *
 * @/lib/queries is mocked — no live DB. generateConfig runs for real
 * (pure function from @mcpfind/shared).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/queries', () => ({
  getServerBySlug: vi.fn(),
}));

import { GET } from './route';
import { getServerBySlug } from '@/lib/queries';

const mockGetServerBySlug = vi.mocked(getServerBySlug);

function call(slug: string, client: string) {
  return GET(new NextRequest(`http://localhost/api/servers/${slug}/config/${client}`), {
    params: Promise.resolve({ slug, client }),
  });
}

const NPM_SERVER = {
  slug: 'chrome-devtools-mcp',
  name: 'Chrome DevTools MCP',
  package_name: 'chrome-devtools-mcp',
  package_type: 'npm',
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetServerBySlug.mockResolvedValue(NPM_SERVER as never);
});

describe('GET /api/servers/[slug]/config/[client]', () => {
  it('rejects a malformed slug with 400', async () => {
    const res = await call('Bad_Slug', 'claude-desktop');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid slug format');
  });

  it('rejects an unknown client with 400', async () => {
    const res = await call('my-server', 'emacs');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('Invalid client');
    expect(mockGetServerBySlug).not.toHaveBeenCalled();
  });

  it('returns 404 when the server does not exist', async () => {
    mockGetServerBySlug.mockResolvedValue(null as never);
    const res = await call('missing', 'claude-desktop');
    expect(res.status).toBe(404);
  });

  it('returns 503 with Retry-After when the query layer fails', async () => {
    mockGetServerBySlug.mockRejectedValue(new Error('db down') as never);
    const res = await call('my-server', 'claude-desktop');
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  const unprocessable: Array<[Record<string, unknown>, string]> = [
    [{ package_name: null, package_type: 'npm' }, 'no package name'],
    [{ package_name: 'x', package_type: null }, 'no package type'],
    [{ package_name: 'x', package_type: 'hosted' }, 'unsupported type'],
  ];
  it.each(unprocessable)('returns 422 for %j (%s)', async (overrides) => {
    mockGetServerBySlug.mockResolvedValue({ ...NPM_SERVER, ...overrides } as never);
    const res = await call('my-server', 'claude-desktop');
    expect(res.status).toBe(422);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('builds the npx config for an npm package with the 7-day cache header', async () => {
    const res = await call('chrome-devtools-mcp', 'claude-desktop');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=604800');
    const body = await res.json();
    expect(body.client).toBe('claude-desktop');
    expect(body.config.mcpServers['chrome-devtools-mcp']).toEqual({
      command: 'npx',
      args: ['-y', 'chrome-devtools-mcp'],
    });
    expect(body.filePath.macos).toContain('claude_desktop_config.json');
  });

  it('adds the stdio discriminator for VS Code', async () => {
    const res = await call('chrome-devtools-mcp', 'vscode');
    const body = await res.json();
    expect(body.config.servers['chrome-devtools-mcp'].type).toBe('stdio');
  });

  it.each([
    ['pypi', 'uvx'],
    ['docker', 'docker'],
  ])('builds the %s command via %s', async (packageType, command) => {
    mockGetServerBySlug.mockResolvedValue({
      ...NPM_SERVER,
      package_type: packageType,
    } as never);
    const res = await call('chrome-devtools-mcp', 'claude-desktop');
    const body = await res.json();
    expect(body.config.mcpServers['chrome-devtools-mcp'].command).toBe(command);
  });

  it('trims whitespace around the package name', async () => {
    mockGetServerBySlug.mockResolvedValue({
      ...NPM_SERVER,
      package_name: '  chrome-devtools-mcp  ',
    } as never);
    const res = await call('chrome-devtools-mcp', 'claude-desktop');
    const body = await res.json();
    expect(body.config.mcpServers['chrome-devtools-mcp'].args).toEqual(['-y', 'chrome-devtools-mcp']);
  });
});
