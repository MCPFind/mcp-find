import { expect, it, vi } from 'vitest';
import { categorizeServers } from './categorizer';

it('drains bounded pages without skipping rows as categorization changes the result set', async () => {
  const rows = Array.from({ length: 1101 }, (_, id) => ({ id: String(id), name: 'Google Calendar', category: null as string | null, registry_tags: [], description: null, package_name: null }));
  const sizes: number[] = [];
  const db = { from: () => ({
    select: () => ({ is: () => ({ order: () => ({ limit: async (limit: number) => ({ data: rows.filter(row => row.category === null).slice(0, limit), error: null }) }) }) }),
    update: (payload: { category: string; updated_at: string }) => ({ in: async (_key: string, ids: string[]) => {
      sizes.push(ids.length);
      for (const row of rows) if (ids.includes(row.id)) row.category = payload.category;
      expect(Date.parse(payload.updated_at)).not.toBeNaN();
      return { error: null };
    } }),
  }) };
  expect(await categorizeServers(db as never)).toBe(1101);
  expect(sizes.every(size => size <= 200)).toBe(true);
  expect(rows.every(row => row.category === 'productivity')).toBe(true);
});

it('preserves progress and fails visibly after a later write fails', async () => {
  const rows = Array.from({ length: 300 }, (_, id) => ({ id: String(id), name: 'calendar', registry_tags: [], description: null, package_name: null }));
  const write = vi.fn().mockResolvedValueOnce({ error: null }).mockResolvedValue({ error: { message: 'timeout' } });
  const progress = vi.fn();
  const db = { from: () => ({
    select: () => ({ is: () => ({ order: () => ({ limit: async () => ({ data: rows, error: null }) }) }) }),
    update: () => ({ in: write }),
  }) };
  await expect(categorizeServers(db as never, progress)).rejects.toThrow('Categorization write failed');
  expect(progress).toHaveBeenLastCalledWith(200);
});
