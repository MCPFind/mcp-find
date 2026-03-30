import type { Server, ServerListItem, ServerWithTools } from '@mcpfind/shared';
import { SITE_NAME, SITE_URL, CATEGORY_LABELS, CATEGORY_DESCRIPTIONS, CATEGORY_FAQS } from '@mcpfind/shared';
import type { Category } from '@mcpfind/shared';
import type { Metadata } from 'next';

export function generateServerJsonLd(server: ServerWithTools): object {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: server.name,
    description: server.description || '',
    url: `${SITE_URL}/servers/${server.slug}`,
    applicationCategory: 'DeveloperApplication',
    operatingSystem: ['Windows', 'macOS', 'Linux'],
    version: server.version || undefined,
    downloadUrl: server.package_url || undefined,
    license: server.github_license
      ? `https://spdx.org/licenses/${server.github_license}`
      : undefined,
    dateModified: server.github_last_push || server.updated_at,
    creator: server.github_url
      ? { '@type': 'Organization', url: server.github_url }
      : undefined,
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
  };
}

export function generateCategoryJsonLd(
  category: string,
  categoryLabel: string,
  servers: ServerListItem[]
): object {
  const faqs = CATEGORY_FAQS[category as Category] || [];

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        name: `${categoryLabel} MCP Servers`,
        description: `Browse ${servers.length}+ ${categoryLabel.toLowerCase()} MCP servers with instant install configs.`,
        url: `${SITE_URL}/categories/${category}`,
        breadcrumb: { '@id': `${SITE_URL}/categories/${category}#breadcrumb` },
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: servers.length,
          itemListElement: servers.slice(0, 50).map((s, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            url: `${SITE_URL}/servers/${s.slug}`,
            name: s.name,
          })),
        },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${SITE_URL}/categories/${category}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'Categories', item: `${SITE_URL}/categories` },
          { '@type': 'ListItem', position: 3, name: `${categoryLabel} MCP Servers`, item: `${SITE_URL}/categories/${category}` },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: faqs.map(faq => ({
          '@type': 'Question',
          name: faq.question,
          acceptedAnswer: {
            '@type': 'Answer',
            text: faq.answer,
          },
        })),
      },
    ],
  };
}

export function generateServerMetadata(server: ServerWithTools): Metadata {
  const categoryLabel = server.category ? (CATEGORY_LABELS[server.category as keyof typeof CATEGORY_LABELS] || server.category) : 'Developer Tools';
  const title = `${server.name} — MCP Server for ${categoryLabel}`;
  const description = `Install ${server.name} in Claude Desktop, Cursor, or VS Code. ${(server.description || '').slice(0, 100)}. ${server.github_stars}+ GitHub stars. Open source.`.slice(0, 160);
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `${SITE_URL}/servers/${server.slug}`,
      siteName: SITE_NAME,
      type: 'website',
      images: [{ url: `${SITE_URL}/og-image-mcp.png`, width: 1200, height: 630, alt: server.name }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
    },
    alternates: {
      canonical: `${SITE_URL}/servers/${server.slug}`,
    },
  };
}

export function generateCategoryMetadata(
  category: string,
  categoryLabel: string,
  count: number
): Metadata {
  const title = `${categoryLabel} MCP Servers`;
  const fullDesc = CATEGORY_DESCRIPTIONS[category as Category] || `Browse ${count}+ ${categoryLabel.toLowerCase()} MCP servers.`;
  // Truncate at sentence boundary (split on ". " not bare "." to avoid splitting Fly.io, e.g., etc.)
  const sentences = fullDesc.split(/(?<=[.!?])\s+/);
  let description = '';
  for (const sentence of sentences) {
    if ((description ? description + ' ' : '') .length + sentence.length > 160) break;
    description = description ? description + ' ' + sentence : sentence;
  }
  if (!description) description = fullDesc.slice(0, 157) + '...';
  return {
    title,
    description,
    openGraph: { title, description, url: `${SITE_URL}/categories/${category}`, siteName: SITE_NAME, type: 'website', images: [{ url: `${SITE_URL}/og-image-mcp.png`, width: 1200, height: 630, alt: `${categoryLabel} MCP Servers` }] },
    twitter: { card: 'summary_large_image', title, description },
    alternates: { canonical: `${SITE_URL}/categories/${category}` },
  };
}
