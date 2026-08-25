import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { BlogPost } from '@/types/blog';

// Mock getPostBySlug so the handler always resolves a post with a
// non-empty author — the exact condition that hits the buggy
// `<div>By {author}</div>` two-child-node tree at 6818cb5.
vi.mock('@/lib/blog', () => ({
  getPostBySlug: vi.fn(),
}));

import { getPostBySlug } from '@/lib/blog';
import Image, { size } from '../opengraph-image';

const mockPost: BlogPost = {
  slug: 'getting-started-with-mcp-in-claude',
  frontmatter: {
    title: 'Getting Started With MCP in Claude',
    description: 'A test post',
    date: '2026-01-01',
    author: 'Jane Doe',
    tags: ['mcp'],
  },
  content: '',
  readingTime: 3,
};

describe('blog opengraph-image', () => {
  beforeEach(() => {
    vi.mocked(getPostBySlug).mockReset();
    vi.mocked(getPostBySlug).mockReturnValue(mockPost);
  });

  it('renders a valid PNG when the streamed body is fully consumed for a post with an author', async () => {
    // CRITICAL: the bug (satori "Expected <div> to have explicit display"
    // for the ["By ", author] two-child-node tree) only surfaces when the
    // ImageResponse's ReadableStream body is actually read — construction
    // alone (`new ImageResponse(...)`) never throws, per @vercel/og's
    // async-start-callback implementation. So this test must consume the
    // stream, not just assert the handler returns a Response synchronously.
    const response = await Image({ params: { slug: mockPost.slug } });

    expect(response).toBeInstanceOf(Response);

    // This is the line that reproduces the bug pre-fix: reading the body
    // forces satori's render pass, which is where the "explicit display"
    // TypeError actually throws (at pipeImpl-equivalent stream-read time).
    const buffer = await response.arrayBuffer();
    const bytes = new Uint8Array(buffer);

    expect(bytes.byteLength).toBeGreaterThan(0);
    // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
    expect(Array.from(bytes.slice(0, 8))).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);

    // Must NOT be the outer-catch 302 fallback (that would mean the main
    // render tree failed and the handler silently degraded).
    expect(response.status).not.toBe(302);
    expect(response.headers.get('content-type')).toBe('image/png');
  });

  it('exposes the documented output dimensions', () => {
    expect(size).toEqual({ width: 1200, height: 630 });
  });

  it('falls back to a 302 redirect (with no-store) when the data layer throws, proving the outer catch is genuinely reachable', async () => {
    // getPostBySlug is a synchronous throw site (fs.readFileSync / matter()
    // can both throw) — unlike a satori render error, this always was
    // reachable by the outer catch. Asserted here as a regression lock so
    // task 12's materialize() refactor didn't accidentally break it.
    vi.mocked(getPostBySlug).mockImplementation(() => {
      throw new Error('simulated frontmatter parse failure');
    });

    const response = await Image({ params: { slug: mockPost.slug } });

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/og-image-mcp.png');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });
});
