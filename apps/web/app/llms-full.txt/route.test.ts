/**
 * llms-full.txt route tests.
 *
 * /llms-full.txt serves the bounded, categorized server index for AI agents.
 * The handler had no coverage; regressions in grouping, fallback labels or
 * the 503 contract would ship silently.
 *
 * @/lib/queries and @/lib/blog are mocked — no live DB in unit tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/queries', () => ({
  getServerCount: vi.fn(),
  getIndexableTopServers: vi.fn(),
}));
vi.mock('@/lib/blog', () => ({
  getAllPosts: vi.fn(),
}));

import { GET } from './route';
import { getServerCount, getIndexableTopServers } from '@/lib/queries';
import { getAllPosts } from '@/lib/blog';

const mockGetServerCount = vi.mocked(getServerCount);
const mockGetIndexableTopServers = vi.mocked(getIndexableTopServers);
const mockGetAllPosts = vi.mocked(getAllPosts);

const SERVERS = [
  {
    name: 'postgres-mcp',
    slug: 'postgres-mcp',
    canonical_slug: 'postgres-mcp-canonical',
    description: 'Postgres tools',
    category: 'databases',
    github_stars: 100,
    github_license: 'MIT',
    package_type: 'npm',
  },
  {
    name: 'sparse-server',
    slug: 'sparse-server',
    canonical_slug: null,
    description: null,
    category: 'other',
    github_stars: 0,
    github_license: null,
    package_type: null,
  },
];

const POSTS = [
  {
    slug: 'guide-one',
    frontmatter: {
      title: 'Guide One',
      description: 'guide description',
      date: '2026-09-01',
      updatedAt: '2026-09-15',
      excerpt: 'guide excerpt',
      tags: ['mcp', 'setup'],
    },
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockGetServerCount.mockResolvedValue(10200 as never);
  mockGetIndexableTopServers.mockResolvedValue(SERVERS as never);
  mockGetAllPosts.mockReturnValue(POSTS as never);
});

describe('GET /llms-full.txt', () => {
  it('renders the index header with live counts and cache headers', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/plain');
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=21600');

    const body = await res.text();
    expect(body).toContain('# MCP Find — Popular Documented Server Index');
    expect(body).toContain('2 popular documented entries from a directory of 10200 active MCP servers, plus 1 blog posts');
  });

  it('asks for the documented bounded subset of 200 servers', async () => {
    await GET();
    expect(mockGetIndexableTopServers).toHaveBeenCalledWith(200);
  });

  it('groups servers under their category label and renders metadata with fallbacks', async () => {
    const body = await (await GET()).text();
    expect(body).toContain('### [postgres-mcp](https://mcpfind.org/servers/postgres-mcp-canonical)');
    expect(body).toContain('- Stars: 100\n- License: MIT\n- Package: npm');
    expect(body).toContain('## Other');
    expect(body).toContain('### [sparse-server](https://mcpfind.org/servers/sparse-server)');
    expect(body).toContain('No description.');
    expect(body).toContain('- License: Unknown\n- Package: Unknown');
  });

  it('renders the blog section with dates, excerpt and tags', async () => {
    const body = await (await GET()).text();
    expect(body).toContain('### [Guide One](https://mcpfind.org/blog/guide-one)');
    expect(body).toContain('Published: 2026-09-01 | Last updated: 2026-09-15');
    expect(body).toContain('guide excerpt');
    expect(body).toContain('Tags: mcp, setup');
  });

  it('degrades to the 503 directory-unavailable response when queries fail', async () => {
    mockGetIndexableTopServers.mockRejectedValue(new Error('db down') as never);
    const res = await GET();
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(await res.text()).toContain('Directory temporarily unavailable');
  });
});
