import { NextRequest, NextResponse } from 'next/server';

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
  if (!request.nextUrl.pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  const ip = getClientIp(request);
  const now = Date.now();
  const entry = rateMap.get(ip);

  if (!entry || entry.resetAt < now) {
    // Lazy eviction: stale entry is replaced
    rateMap.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return NextResponse.next();
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

  return NextResponse.next();
}

export const config = { matcher: '/api/:path*' };
