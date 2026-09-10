import { describe, expect, it } from 'vitest';
import { checkPost } from '../check-blog-release.mjs';
const article = (date, extra='') => `---\ntitle: Example\ndate: '${date}'\n${extra}\n---\nSetup according to the [maintainer](https://example.com/docs).`;
describe('blog publication gate', () => {
  it('rejects rollover dates', () => expect(checkPost(article('2026-02-31'), null, '2026-09-10').join()).toContain('invalid publication date'));
  it('does not count a directory self-link as a source', () => expect(checkPost(article('2026-09-10').replace('https://example.com/docs', 'https://mcpfind.org/servers'), null, '2026-09-10').join()).toContain('external source'));
  it('does not count an external image as a source', () => expect(checkPost(article('2026-09-10').replace('[maintainer]', '![diagram]'), null, '2026-09-10').join()).toContain('external source'));
  it('rejects a stranded draft being backdated on release', () => expect(checkPost(article('2026-09-09'), null, '2026-09-10').join()).toContain('UTC release day'));
  it('accepts a new release dated today', () => expect(checkPost(article('2026-09-10'), null, '2026-09-10')).toEqual([]));
  it('preserves original dates on substantive refreshes', () => expect(checkPost(article('2026-08-01', "updatedAt: '2026-09-10'"), article('2026-08-01'), '2026-09-10')).toEqual([]));
  it('rejects invalid revision dates', () => expect(checkPost(article('2026-08-01', "updatedAt: '2026-02-31'"), article('2026-08-01'), '2026-09-10').join()).toContain('valid date'));
  it('rejects rewriting publication history', () => expect(checkPost(article('2026-09-10'), article('2026-08-01'), '2026-09-10').join()).toContain('preserve'));
  it('does not publish drafts', () => expect(checkPost(article('2026-08-01', 'draft: true'), null, '2026-09-10')).toEqual([]));
});
