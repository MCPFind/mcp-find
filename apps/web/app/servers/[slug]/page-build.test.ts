import { beforeEach, describe, expect, it, vi } from 'vitest';
const queries = vi.hoisted(() => ({ getServerBySlug: vi.fn(), getIndexableServerSlugs: vi.fn() }));
vi.mock('@/lib/queries', () => queries);
vi.mock('@/lib/metadata', () => ({ generateServerMetadata: () => ({ title: 'Server' }), generateServerJsonLd: () => ({}) }));
import { generateStaticParams, generateMetadata, dynamicParams, revalidate } from './page';

beforeEach(() => { vi.clearAllMocks(); });
describe('detail route build independence', () => {
  it('does no directory scan even when credentials exist and legacy scan would fail', () => {
    vi.stubEnv('SUPABASE_URL', 'https://legacy.example.test');
    vi.stubEnv('SUPABASE_ANON_KEY', 'test-only');
    queries.getIndexableServerSlugs.mockRejectedValue(new Error('42703 readme_length missing; legacy scan timed out'));
    expect(generateStaticParams()).toEqual([]);
    expect(queries.getIndexableServerSlugs).not.toHaveBeenCalled();
    expect(queries.getServerBySlug).not.toHaveBeenCalled();
    expect(dynamicParams).toBe(true);
    expect(revalidate).toBe(604800);
    vi.unstubAllEnvs();
  });
  it('still surfaces runtime outages rather than caching missing content', async () => {
    queries.getServerBySlug.mockRejectedValue(new Error('Directory temporarily unavailable'));
    await expect(generateMetadata({ params: Promise.resolve({ slug: 'server' }) })).rejects.toThrow('temporarily unavailable');
  });
  it('keeps runtime metadata noindex without documentation/tool evidence', async () => {
    queries.getServerBySlug.mockResolvedValue({ slug: 'server', registry_status: 'active', github_archived: false,
      readme_content: null, tool_count: 0, has_tools: false, github_stars: 100,
      category: 'devtools', package_name: 'example', package_type: 'npm' });
    const metadata = await generateMetadata({ params: Promise.resolve({ slug: 'server' }) });
    expect(metadata.robots).toMatchObject({ index: false });
  });
});
