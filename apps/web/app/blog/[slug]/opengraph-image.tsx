import { ImageResponse } from 'next/og';
import { getPostBySlug } from '@/lib/blog';

export const alt = 'MCP Find Blog';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function Image({ params }: { params: { slug: string } }) {
  const post = getPostBySlug(params.slug);
  const title = post
    ? post.frontmatter.title.slice(0, 100)
    : 'MCP Find Blog';
  const author = post?.frontmatter.author || '';

  try {
    return new ImageResponse(
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
              }}
            >
              ⚡
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
            <div style={{ fontSize: '22px', color: '#a3a3a3' }}>
              By {author}
            </div>
          )}
        </div>
      ),
      { ...size }
    );
  } catch {
    // Fallback: simple branded image
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 50%, #0a0a0a 100%)',
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
  }
}
