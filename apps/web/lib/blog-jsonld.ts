import { SITE_URL } from '@mcpfind/shared';
import type { BlogPost } from '@/types/blog';

export function generateBlogPostJsonLd(post: BlogPost): object {
  const wordCount = post.content
    .replace(/^---[\s\S]*?---/, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<[^>]+>/g, '')
    .split(/\s+/)
    .filter(Boolean).length;

  const graph: object[] = [
    {
      '@type': 'Article',
      '@id': `${SITE_URL}/blog/${post.slug}#article`,
      headline: post.frontmatter.title,
      description: post.frontmatter.description,
      datePublished: post.frontmatter.date,
      dateModified: post.frontmatter.updatedAt || post.frontmatter.date,
      author: {
        '@type': 'Person',
        name: post.frontmatter.author,
        url: post.frontmatter.authorUrl || SITE_URL,
        ...(post.frontmatter.authorSameAs?.length ? { sameAs: post.frontmatter.authorSameAs } : {}),
      },
      publisher: { '@id': `${SITE_URL}/#organization` },
      isPartOf: { '@id': `${SITE_URL}/blog#blog` },
      mainEntityOfPage: `${SITE_URL}/blog/${post.slug}`,
      image: {
        '@type': 'ImageObject',
        url: `${SITE_URL}/blog/${post.slug}/opengraph-image`,
        width: 1200,
        height: 630,
      },
      inLanguage: 'en-US',
      wordCount,
      keywords: post.frontmatter.tags,
    },
    {
      '@type': 'BreadcrumbList',
      '@id': `${SITE_URL}/blog/${post.slug}#breadcrumb`,
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE_URL}/blog` },
        { '@type': 'ListItem', position: 3, name: post.frontmatter.title, item: `${SITE_URL}/blog/${post.slug}` },
      ],
    },
  ];

  // Add FAQPage when faqItems present
  if (post.frontmatter.faqItems && post.frontmatter.faqItems.length > 0) {
    graph.push({
      '@type': 'FAQPage',
      '@id': `${SITE_URL}/blog/${post.slug}#faqpage`,
      mainEntity: post.frontmatter.faqItems.map(item => ({
        '@type': 'Question',
        name: item.question,
        acceptedAnswer: { '@type': 'Answer', text: item.answer },
      })),
    });
  }

  return { '@context': 'https://schema.org', '@graph': graph };
}

export function generateBlogIndexJsonLd(): object {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Blog',
        '@id': `${SITE_URL}/blog#blog`,
        name: 'MCP Find Blog',
        description: 'Guides, tutorials, and analysis on MCP servers and the Model Context Protocol.',
        url: `${SITE_URL}/blog`,
        publisher: { '@id': `${SITE_URL}/#organization` },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${SITE_URL}/blog#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'Blog', item: `${SITE_URL}/blog` },
        ],
      },
    ],
  };
}
