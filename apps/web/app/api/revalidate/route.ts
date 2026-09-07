import { revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'crypto';

const RATE_LIMIT_WINDOW = 60_000; // 1 minute
const RATE_LIMIT_MAX = 10; // max 10 requests per minute
// In-memory rate limiter — soft guardrail only. On Vercel serverless, each
// cold-start instance gets its own Map, so this does not provide hard protection
// against distributed attacks. Sufficient for accidental abuse prevention.
const requestLog = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const timestamps = requestLog.get(ip)?.filter(t => now - t < RATE_LIMIT_WINDOW) ?? [];
  timestamps.push(now);
  requestLog.set(ip, timestamps);
  // LRU eviction: if too many distinct IPs, delete the oldest entry
  if (requestLog.size > 10_000) {
    const oldestKey = requestLog.keys().next().value;
    if (oldestKey) requestLog.delete(oldestKey);
  }
  return timestamps.length > RATE_LIMIT_MAX;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  // x-real-ip: set by some proxies (not Vercel). x-forwarded-for .pop(): last
  // entry is appended by Vercel and cannot be spoofed by the client (leftmost
  // entries are client-supplied and untrustworthy).
  const ip = request.headers.get('x-real-ip') ?? request.headers.get('x-forwarded-for')?.split(',').pop()?.trim() ?? 'unknown';
  if (isRateLimited(ip)) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const envToken = process.env.REVALIDATE_TOKEN;
  if (!envToken) {
    return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 });
  }

  const token = request.headers.get('x-revalidate-token');
  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let tokenValid = false;
  try {
    const a = Buffer.from(token);
    const b = Buffer.from(envToken);
    tokenValid = a.length === b.length && timingSafeEqual(a, b);
  } catch {
    tokenValid = false;
  }

  if (!tokenValid) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // T1 fix (2026-08-25): this endpoint used to call revalidateTag('servers')
  // unconditionally on every invocation — the ONLY tag every one of the 12
  // unstable_cache call sites in lib/queries.ts shares — so the daily sync's
  // "Bust Vercel cache" step (.github/workflows/sync.yml) purged EVERY
  // cached server, capping the intended 7-day ISR window on /servers/[slug]
  // (getServerBySlug, 604800s) at an effective ~24h ceiling regardless of
  // which rows actually changed.
  //
  // New contract:
  //   { slugs: string[] }  — the default, expected shape. Busts the
  //     per-server `server-<slug>` tag (already present at
  //     getServerBySlug's unstable_cache call) for each changed slug, plus
  //     the narrow 'servers-listing' aggregate tag once for index/listing
  //     surfaces (listServers, getServerCount, getTopServers, category
  //     pages, etc.) — never the blanket 'servers' tag every cache entry
  //     shares.
  //   {}  or no body        — same as slugs: [] — busts ONLY the aggregate
  //     'servers-listing' tag. This is what packages/sync's internal
  //     Stage-4 triggerSiteRevalidation() call sends (no body) — its own
  //     comment says its purpose is "refresh the cached server count," which
  //     the aggregate-only tag covers correctly without also purging every
  //     unrelated per-server cache.
  //   { full: true }        — explicit, documented escape hatch for a full
  //     blanket purge (the pre-fix behavior). Never the default; must be
  //     requested on purpose (e.g. a schema/categorization change that
  //     plausibly touches many rows at once, or manual ops recovery).
  let payload: { slugs?: unknown; full?: unknown } = {};
  try {
    const bodyText = await request.text();
    if (bodyText) {
      const parsed: unknown = JSON.parse(bodyText);
      if (parsed && typeof parsed === 'object') {
        payload = parsed as { slugs?: unknown; full?: unknown };
      }
    }
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const full = payload.full === true;
  // Cap defends against an oversized/malformed payload — well above any
  // legitimate single day's real change volume from the sync pipeline.
  const MAX_SLUGS = 5000;
  const slugs = Array.isArray(payload.slugs)
    ? payload.slugs.filter((s): s is string => typeof s === 'string' && s.length > 0).slice(0, MAX_SLUGS)
    : [];

  try {
    if (full) {
      // Documented full-purge fallback — explicit opt-in only, see comment
      // above. Never reached by a default/empty-body call.
      revalidateTag('servers');
    } else {
      for (const slug of slugs) {
        revalidateTag(`server-${slug}`);
      }
      revalidateTag('servers-listing');
    }
  } catch (err) {
    console.error('Revalidation failed:', err);
    return NextResponse.json({ error: 'Revalidation failed' }, { status: 500 });
  }

  return NextResponse.json({ revalidated: true, full, slugCount: slugs.length, now: Date.now() });
}
