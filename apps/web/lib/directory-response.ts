export function directoryUnavailable() {
  return new Response('Directory temporarily unavailable. Please retry.', {
    status: 503,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'CDN-Cache-Control': 'no-store',
      'Vercel-CDN-Cache-Control': 'no-store',
      'Retry-After': '60',
    },
  });
}
