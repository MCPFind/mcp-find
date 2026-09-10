#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const require = createRequire(new URL('../apps/web/package.json', import.meta.url));
const matter = require('gray-matter');
const day = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? '');
const isCalendarDay = value => /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value))
  && new Date(value).toISOString().slice(0, 10) === value;
export function checkPost(current, previous, today) {
  const { data, content } = matter(current);
  if (data.draft) return [];
  const prior = previous == null ? null : matter(previous).data;
  const errors = [];
  const date = day(data.date);
  if (!isCalendarDay(date)) errors.push('invalid publication date');
  else if (date > today) errors.push('publication date is in the future');
  if (!prior || prior.draft) {
    if (date !== today) errors.push('newly published posts must use the UTC release day; refresh stale PR dates before release');
  } else if (day(prior.date) !== date) errors.push('preserve the original publication date; use updatedAt for substantive revisions');
  const updatedAt = data.updatedAt ? day(data.updatedAt) : '';
  if (updatedAt && (!isCalendarDay(updatedAt) || updatedAt > today || updatedAt < date)) errors.push('updatedAt must be a valid date between publication and today');
  const sourceLinks = [...content.matchAll(/(?<!!)\[[^\]]+\]\((https:\/\/[^)]+)\)/g)].some(match => {
    try { return !['mcpfind.org', 'www.mcpfind.org'].includes(new URL(match[1]).hostname); } catch { return false; }
  });
  if (!sourceLinks) errors.push('include an external source link in the article body');
  return errors;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const base = process.env.BLOG_BASE_REF || 'HEAD~1';
  const today = new Date().toISOString().slice(0, 10);
  const files = execFileSync('git', ['diff', '--name-only', '--diff-filter=AM', base, '--', 'apps/web/content/blog/*.mdx'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean);
  let failed = false;
  for (const file of files) {
    if (file.split('/').pop().startsWith('_')) continue;
    let previous = null;
    try { previous = execFileSync('git', ['show', `${base}:${file}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch { /* new article */ }
    for (const error of checkPost(readFileSync(file, 'utf8'), previous, today)) { console.error(`${file}: ${error}`); failed = true; }
  }
  if (failed) process.exitCode = 1;
  else console.log(`Blog release check passed (${files.length} changed articles).`);
}
