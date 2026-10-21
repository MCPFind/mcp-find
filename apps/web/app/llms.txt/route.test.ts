/**
 * llms.txt route tests.
 *
 * /llms.txt is the AI-agent discovery entry point advertised in the README
 * and served to crawlers; a regression here silently degrades how agents
 * see the directory. The handler had no coverage.
 *
 * @/lib/queries and @/lib/blog are mocked so the render logic (links,
 * truncation, headers, error semantics) is asserted without a live DB.
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

const LONG_DESCRIPTION = 'x'.repeat(150);

const SERVERS = [
  {
    name: 'postgres-mcp',
    slug: 'postgres-mcp',
    canonical_slug: 'postgres-mcp-canonical',
    description: LONG_DESCRIPTION,
    category: 'databases',
  },
  {
    name: 'plain-slug-server',
    slug: 'plain-slug-server',
    canonical_slug: null,
    description: 'short description',
    category: 'developer-tools',
  },
];

const POSTS = [
  {
    slug: 'hello-world',
    frontmatter: {
      title: 'Hello World',
      description: 'post description here',
    },
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockGetServerCount.mockResolvedValue(12345 as never);
  mockGetIndexableTopServers.mockResolvedValue(SERVERS as never);
  mockGetAllPosts.mockReturnValue(POSTS as never);
});

describe('GET /llms.txt', () => {
  it('renders the header, sections and plain-text cache headers', async () => {
    const res = await GET();
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/plain');
    expect(res.headers.get('Cache-Control')).toContain('s-maxage=21600');

    const body = await res.text();
    expect(body).toContain('# MCP Find');
    expect(body).toContain('12345+ MCP');
    expect(body).toContain('## Popular Categories');
    expect(body).toContain('## API');
    expect(body).toContain('## Top Servers');
    expect(body).toContain('## Blog');
  });

  it('asks for the documented bounded subset and blog limit', async () => {
    await GET();
    expect(mockGetIndexableTopServers).toHaveBeenCalledWith(20);
    expect(mockGetAllPosts).toHaveBeenCalledWith({ limit: 10 });
  });

  it('prefers canonical_slug over slug in server links', async () => {
    const body = await (await GET()).text();
    expect(body).toContain('/servers/postgres-mcp-canonical');
    expect(body).not.toContain('](/servers/postgres-mcp):');
    expect(body).toContain('/servers/plain-slug-server');
  });

  it('truncates server descriptions at 100 characters', async () => {
    const body = await (await GET()).text();
    expect(body).toContain('x'.repeat(100));
    expect(body).not.toContain('x'.repeat(101));
    expect(body).toContain('short description');
  });

  it('links blog posts under /blog/', async () => {
    const body = await (await GET()).text();
    expect(body).toContain('[Hello World](https://mcpfind.org/blog/hello-world)');
  });

  it('degrades to the 503 directory-unavailable response when queries fail', async () => {
    mockGetServerCount.mockRejectedValue(new Error('db down') as never);
    const res = await GET();
    expect(res.status).toBe(503);
    expect(res.headers.get('Retry-After')).toBe('60');
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.text()).toContain('Directory temporarily unavailable');
  });
});
