import { NextRequest, NextResponse } from 'next/server';
import { listServers } from '@/lib/queries';
import { CATEGORIES } from '@mcpfind/shared';
import type { Category, SortOption } from '@mcpfind/shared';

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;

  const q = searchParams.get('q') || undefined;
  const category = searchParams.get('category') as Category | undefined;
  const sort = (searchParams.get('sort') || 'stars') as SortOption;
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '24', 10);
  const status = (searchParams.get('status') || 'active') as 'active' | 'deprecated';

  // Validate category
  if (category && !CATEGORIES.includes(category)) {
    return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
  }

  // Validate sort
  if (!['stars', 'updated', 'name', 'downloads'].includes(sort)) {
    return NextResponse.json({ error: 'Invalid sort' }, { status: 400 });
  }

  try {
    const result = await listServers({ q, category, sort, page, limit, status });
    return NextResponse.json(result);
  } catch (err) {
    console.error('listServers error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
