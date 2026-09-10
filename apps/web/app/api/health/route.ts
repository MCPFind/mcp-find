import { NextResponse } from 'next/server';
import { getServerCount, getLastSyncTime } from '@/lib/queries';

export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const [count, lastSync] = await Promise.all([
      getServerCount(),
      getLastSyncTime(),
    ]);
    return NextResponse.json({
      status: 'ok',
      serverCount: count,
      lastSync,
    });
  } catch {
    return NextResponse.json({ status: 'error' }, {
      status: 503, headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' },
    });
  }
}
