import { ImageResponse } from 'next/og';
import { getPostBySlug } from '@/lib/blog';

export const alt = 'MCP Find Blog';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// `next/og`'s ImageResponse builds its PNG lazily inside a ReadableStream's
// `start()` callback (see next/dist/server/og/image-response.js /
// @vercel/og's index.{node,edge}.js) — `new ImageResponse(...)` itself never
// throws for a satori render-tree error; the error only surfaces when the
// stream body is actually read, which Next.js does during response
// streaming (pipeImpl), *after* this handler has already returned. A
// try/catch wrapped only around the `new ImageResponse(...)` call or around
// this whole function is therefore dead code for that failure class — it
// was verified empirically (task 12) that neither catch below ever ran for
// a satori render error.
//
// Fix: materialize each ImageResponse's body (`.arrayBuffer()`) inside the
// handler before returning, so a render-time failure surfaces as a genuine
// synchronous rejection *inside* our own try/catch instead of one that
// escapes to Next's streaming pipeline after we've already returned. This
// makes the existing fallback tiers (minimal branded image, then a redirect
// to the static OG image) actually reachable again, matching the
// error-handling behavior the comments here always described.
async function materialize(response: Response): Promise<Response> {
  const buffer = await response.arrayBuffer();
  return new Response(buffer, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

export default async function Image({ params }: { params: { slug: string } }) {
  try {
    const post = getPostBySlug(params.slug);
    const title = post
      ? post.frontmatter.title.slice(0, 100)
      : 'MCP Find Blog';
    const author = post?.frontmatter.author || '';

    try {
      const rendered = new ImageResponse(
        (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              padding: '80px',
              background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0a0a0a 100%)',
              color: 'white',
              fontFamily: 'sans-serif',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                marginBottom: '40px',
              }}
            >
              {/* No emoji here — @vercel/og fetches emoji from Twemoji CDN
                  which can time out or fail in serverless, causing 500s. */}
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '20px',
                  fontWeight: 'bold',
                  color: 'white',
                }}
              >
                M
              </div>
              <span style={{ fontSize: '24px', color: '#a3a3a3' }}>MCP Find Blog</span>
            </div>
            <div
              style={{
                fontSize: title.length > 60 ? '42px' : '52px',
                fontWeight: 'bold',
                lineHeight: 1.2,
                marginBottom: '24px',
                maxWidth: '900px',
              }}
            >
              {title}
            </div>
            {author && (
              // Single interpolated-string child (not ["By ", author], two
              // JSX child nodes) — satori requires an explicit
              // display:flex/none on any <div> with more than one child
              // node, which this element never had. This was the root
              // cause of the 500s (task 12).
              <div style={{ fontSize: '22px', color: '#a3a3a3' }}>
                {`By ${author}`}
              </div>
            )}
          </div>
        ),
        { ...size }
      );
      // Force the satori render pass to run now, inside this try block,
      // instead of letting it fail later during Next's response streaming
      // where neither catch here could ever see it.
      return await materialize(rendered);
    } catch {
      // Inner fallback: ImageResponse render failed (e.g. font layout error).
      // Return a minimal text-only branded image. Reachable now: any error
      // from the primary render's materialize() above lands here.
      const fallback = new ImageResponse(
        (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: '#0a0a0a',
              color: 'white',
              fontFamily: 'sans-serif',
              fontSize: '48px',
              fontWeight: 'bold',
            }}
          >
            MCP Find Blog
          </div>
        ),
        { ...size }
      );
      return await materialize(fallback);
    }
  } catch {
    // Outer fallback: wasm/Resvg failed entirely, or the minimal fallback
    // above also failed to render — redirect to the static OG image so the
    // page still has a valid og:image rather than a 500. Reachable now: any
    // error from getPostBySlug/frontmatter access, or from the inner
    // fallback's own materialize(), lands here. no-store so a transient
    // render failure is never cached as this response by a CDN — the
    // opposite of ImageResponse's own default `max-age=31536000, immutable`
    // header, which was applied on construction before render success was
    // known and is one plausible source of the observed `age: 3067` on a
    // 500.
    return new Response(null, {
      status: 302,
      headers: { Location: '/og-image-mcp.png', 'Cache-Control': 'no-store' },
    });
  }
}
