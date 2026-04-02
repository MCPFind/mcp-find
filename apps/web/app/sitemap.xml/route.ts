import { getTopServers, getCategoryLastUpdated } from '@/lib/queries';
import { SITE_URL, CATEGORIES } from '@mcpfind/shared';
import { getAllPosts } from '@/lib/blog';

export const dynamic = 'force-dynamic';

export async function GET() {
  const [servers, categoryLastUpdated] = await Promise.all([
    getTopServers(5000),
    getCategoryLastUpdated(),
  ]);

  const today = new Date().toISOString().split('T')[0];
  const staticPages = [
    { url: SITE_URL, changefreq: 'daily', priority: '1.0', lastmod: today },
    { url: `${SITE_URL}/servers`, changefreq: 'daily', priority: '0.9', lastmod: today },
  ];

  const categoryPages = CATEGORIES.map(cat => ({
    url: `${SITE_URL}/categories/${cat}`,
    changefreq: 'weekly' as const,
    priority: '0.8',
    lastmod: categoryLastUpdated[cat] || today,
  }));

  const serverPages = servers.map(s => ({
    url: `${SITE_URL}/servers/${s.slug}`,
    changefreq: 'daily' as const,
    priority: '0.7',
    lastmod: s.updated_at,
  }));

  // Blog pages
  const blogPosts = getAllPosts();
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const blogIndexPage = [{
    url: `${SITE_URL}/blog`,
    changefreq: 'weekly' as const,
    priority: '0.8',
    lastmod: blogPosts[0]?.frontmatter.date || today,
  }];

  const blogPages = blogPosts.map(post => {
    const lastmod = post.frontmatter.updatedAt || post.frontmatter.date;
    const isRecent = new Date(lastmod) > thirtyDaysAgo;
    return {
      url: `${SITE_URL}/blog/${post.slug}`,
      changefreq: (isRecent ? 'weekly' : 'monthly') as string,
      priority: post.frontmatter.cornerstone ? '0.8' : '0.6',
      lastmod,
    };
  });

  const allPages = [...staticPages, ...categoryPages, ...serverPages, ...blogIndexPage, ...blogPages];

  const renderUrl = (p: { url: string; changefreq: string; priority: string; lastmod?: string }) => {
    const lastmodStr = p.lastmod ? `\n    <lastmod>${new Date(p.lastmod).toISOString().split('T')[0]}</lastmod>` : '';
    return `  <url>
    <loc>${p.url}</loc>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>${lastmodStr}
  </url>`;
  };

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allPages.map(renderUrl).join('\n')}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
