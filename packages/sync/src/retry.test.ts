import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchWithRetry } from './retry';
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe('registry retry budget', () => {
  it('retries 429 and 5xx with bounded backoff then recovers', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '999' } }))
      .mockResolvedValueOnce(new Response('', { status: 503 })).mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetch);
    const result = fetchWithRetry('https://registry.example/servers');
    await vi.runAllTimersAsync();
    expect((await result).status).toBe(200);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
  it('stops after three transient failures and does not retry 404', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn().mockImplementation(async () => new Response('', { status: 500 }));
    vi.stubGlobal('fetch', fetch);
    const result = fetchWithRetry('https://registry.example/servers');
    await vi.runAllTimersAsync();
    expect((await result).status).toBe(500);
    expect(fetch).toHaveBeenCalledTimes(3);
    fetch.mockClear().mockResolvedValue(new Response('', { status: 404 }));
    expect((await fetchWithRetry('https://registry.example/missing')).status).toBe(404);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
