import { beforeEach, describe, expect, it, vi } from 'vitest';

type Result = { data: unknown; count?: number; error?: { message: string; code?: string } | null };
const state = vi.hoisted(() => ({
  results: [] as Result[], signals: [] as AbortSignal[], reads: 0,
  cache: new Map<string, unknown>(),
}));
vi.mock('react', async original => ({
  ...await original<typeof import('react')>(), cache: (fn: unknown) => fn,
}));
vi.mock('next/cache', () => ({
  unstable_cache: (fn: () => Promise<unknown>, keys: string[]) => async () => {
    const key = JSON.stringify(keys);
    if (state.cache.has(key)) return state.cache.get(key);
    const value = await fn();
    state.cache.set(key, value);
    return value;
  },
}));
vi.mock('./supabase', () => ({ supabase: {
  from: () => {
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'order', 'range', 'limit', 'in', 'textSearch', 'maybeSingle', 'or']) {
      chain[method] = () => chain;
    }
    chain.abortSignal = (signal: AbortSignal) => { state.signals.push(signal); return chain; };
    chain.then = (resolve: (result: Result) => void) => {
      state.reads++;
      const result = state.results.shift();
      if (!result) throw new Error('Unexpected database read');
      return resolve(result);
    };
    return chain;
  },
} }));
import { getServerBySlug, listServers, getServersSitemapPage, __resetReadmeLengthProbe } from './queries';
const outage: Result = { data: null, error: { message: 'timeout', code: '57014' } };
const server = { id: 'one', slug: 'one', canonical_slug: 'one', registry_status: 'active' };

beforeEach(() => {
  state.results = []; state.signals = []; state.reads = 0; state.cache.clear();
  __resetReadmeLengthProbe();
});

describe('directory failures do not become persistent content', () => {
  it('fails a canonical lookup promptly without hiding its error behind legacy lookup, then recovers', async () => {
    state.results.push(outage);
    await expect(getServerBySlug('one')).rejects.toThrow('temporarily unavailable');
    expect(state.reads).toBe(1);
    state.results.push({ data: server }, { data: [] });
    expect(await getServerBySlug('one')).toMatchObject(server);
    expect(await getServerBySlug('one')).toMatchObject(server);
    expect(state.reads).toBe(3);
  });
  it('shares one deadline across canonical, legacy and tools reads', async () => {
    state.results.push({ data: null }, { data: server }, { data: [] });
    expect(await getServerBySlug('legacy')).toMatchObject(server);
    expect(state.signals).toHaveLength(3);
    expect(new Set(state.signals).size).toBe(1);
  });
  it('only treats two successful absent lookups as missing', async () => {
    state.results.push({ data: null }, outage);
    await expect(getServerBySlug('missing')).rejects.toThrow();
    state.results.push({ data: null }, { data: null });
    expect(await getServerBySlug('missing')).toBeNull();
  });
  it('does not cache lost tool documentation as an empty tools list', async () => {
    state.results.push({ data: server }, outage);
    await expect(getServerBySlug('one')).rejects.toThrow();
    state.results.push({ data: server }, { data: [{ name: 'query' }] });
    expect((await getServerBySlug('one'))?.tools).toHaveLength(1);
  });
  it('does not cache listing with a failed count as a successful zero result', async () => {
    state.results.push(outage, { data: [server] });
    await expect(listServers({})).rejects.toThrow();
    state.results.push({ data: null, count: 1 }, { data: [server] });
    expect((await listServers({})).total).toBe(1);
  });
  it('includes status and normalizes array order/defaults in cache keys', async () => {
    state.results.push({ data: null, count: 1 }, { data: [server] });
    await listServers({ packageTypes: ['npm', 'pypi', 'npm'] });
    await listServers({ packageTypes: ['pypi', 'npm'], page: 1, sort: 'stars', status: 'active' });
    expect(state.reads).toBe(2);
    state.results.push({ data: null, count: 0 }, { data: [] });
    expect((await listServers({ packageTypes: ['npm', 'pypi'], status: 'deprecated' })).total).toBe(0);
    expect(state.reads).toBe(4);
  });
  it('rejects the whole sitemap when a later window fails, then retries all windows', async () => {
    const row = { ...server, github_archived: false, readme_length: 500, package_name: 'one', package_type: 'npm', tool_count: 0, github_stars: 10 };
    state.results.push({ data: Array.from({ length: 1000 }, () => row) }, outage);
    await expect(getServersSitemapPage(0, 2000)).rejects.toThrow();
    state.results.push({ data: [row] });
    expect(await getServersSitemapPage(0, 2000)).toHaveLength(1);
    expect(state.reads).toBe(3);
  });
});
