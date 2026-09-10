import { NextRequest, NextResponse } from 'next/server';
import { parseFilterParams, buildFilterUrl } from './lib/filter-utils';

// NOTE: The static deleted-server-slugs.json 410 block was removed on 2026-06-01
// (feat/curate-and-live-count). It over-blocked ~5,500 servers that were re-added
// as live by the daily registry sync. Dynamic 410 responses are now returned
// from the server detail page itself when registry_status = 'deprecated'.

// NOTE: This rate limiter is in-memory and only effective on a single process.
// On free-tier Vercel (serverless), each function invocation may run in a
// separate process, so this provides best-effort rate limiting only.
const rateMap = new Map<string, { count: number; resetAt: number }>();
const LIMIT = 100;
const WINDOW_MS = 60_000;

function getClientIp(request: NextRequest): string {
  // Vercel provides request.ip; fallback to rightmost x-forwarded-for (proxy-appended)
  if (request.ip) return request.ip;
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const parts = forwarded.split(',');
    return parts[parts.length - 1]!.trim();
  }
  return 'unknown';
}

export function middleware(request: NextRequest) {
  // Keep arbitrary queries off the canonical ISR page without changing public URLs.
  const browseQuery = request.nextUrl.pathname === '/servers' && request.nextUrl.search !== '';
  // Internal ISR entry points are not independent public URLs.
  if (request.nextUrl.pathname.startsWith('/directory-root/')) return new NextResponse(null, { status: 404 });
  const surfaces: Record<string, string> = { '/': 'home', '/servers': 'servers', '/categories': 'categories' };
  let destination: URL | undefined;
  if (surfaces[request.nextUrl.pathname]) {
    destination = new URL(request.url);
    destination.pathname = `/directory-root/${surfaces[request.nextUrl.pathname]}`;
  }
  if (browseQuery) {
    const raw = Object.fromEntries(request.nextUrl.searchParams);
    if ((raw.q?.length ?? 0) > 120 || (raw.page && (!/^\d+$/.test(raw.page) || Number(raw.page) > 100))) {
      return NextResponse.json({ error: 'Search query or page exceeds the supported range' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } });
    }
    const filters = parseFilterParams(raw);
    const normalized = new URL(buildFilterUrl(filters), request.url);
    if (filters.page > 1) normalized.searchParams.set('page', String(filters.page));
    if (normalized.search !== request.nextUrl.search) return NextResponse.redirect(normalized, 308);
    destination = new URL(request.url);
    destination.pathname = [...normalized.searchParams.keys()].every(key => key === 'page')
      ? `/directory-page/${filters.page}` : '/directory-search';
  }
  const proceed = () => destination ? NextResponse.rewrite(destination) : NextResponse.next();
  if (!request.nextUrl.pathname.startsWith('/api/') && !browseQuery && request.nextUrl.pathname !== '/directory-search') return proceed();

  const ip = getClientIp(request);
  const now = Date.now();
  const entry = rateMap.get(ip);

  if (!entry || entry.resetAt < now) {
    // Lazy eviction: stale entry is replaced
    // Bound memory even when many distinct clients arrive in one window.
    if (rateMap.size >= 10000) {
      for (const [key, value] of rateMap) if (value.resetAt < now) rateMap.delete(key);
      if (rateMap.size >= 10000) rateMap.delete(rateMap.keys().next().value!);
    }
    rateMap.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return proceed();
  }

  entry.count++;
  if (entry.count > LIMIT) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return NextResponse.json(
      { error: 'Rate limited. Please wait before making more requests.', retryAfter },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    );
  }

  // Evict stale entries every 1000 requests
  if (rateMap.size > 1000) {
    for (const [key, entry] of rateMap) {
      if (entry.resetAt < now) rateMap.delete(key);
    }
  }

  return proceed();
}

export const config = { matcher: ['/', '/categories', '/api/:path*', '/servers', '/directory-search', '/directory-root/:path*'] };
