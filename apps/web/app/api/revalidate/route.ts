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

  try {
    revalidateTag('servers');
  } catch (err) {
    console.error('Revalidation failed:', err);
    return NextResponse.json({ error: 'Revalidation failed' }, { status: 500 });
  }

  return NextResponse.json({ revalidated: true, now: Date.now() });
}
