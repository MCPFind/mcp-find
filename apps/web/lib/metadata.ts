import type { Server, ServerListItem, ServerWithTools } from '@mcpfind/shared';
import { SITE_NAME, SITE_URL, CATEGORY_LABELS, CATEGORY_DESCRIPTIONS, CATEGORY_FAQS } from '@mcpfind/shared';
import type { Category } from '@mcpfind/shared';
import type { Metadata } from 'next';

/** Pad sentences appended when a generated description is below the 120-char floor. */
const PAD_PHRASES = [
  ' Discover and compare MCP servers on MCPFind.',
  ' Browse open-source integrations for Claude Desktop, Cursor, and VS Code.',
] as const;

/**
 * Ensure description is in [120, 160] characters.
 * - Already >=120: return as-is (trimmed to 160 at a word boundary if over the ceiling).
 * - Below 120: append pad phrases in order. If a full phrase would exceed 160 but the
 *   running length is still <120, append a word-boundary-truncated slice so the result
 *   lands as close to 160 as possible without exceeding it.
 * Note: targets [120,160] given current PAD_PHRASES — not a hard guarantee if the input
 * is very short and truncation clips below 120 (a console.warn is emitted in that case).
 */
function applyDescriptionFloor(description: string): string {
  /** Trim a string to `max` chars at the last word boundary, stripping trailing punctuation/space. */
  function trimToWordBoundary(s: string, max: number): string {
    if (s.length <= max) return s;
    const slice = s.slice(0, max);
    const lastSpace = slice.lastIndexOf(' ');
    const cut = lastSpace > 0 ? slice.slice(0, lastSpace) : slice;
    return cut.replace(/[\s,;:.]+$/, '');
  }

  if (description.length > 160) return trimToWordBoundary(description, 160);
  if (description.length >= 120) return description;

  let result = description;
  for (const phrase of PAD_PHRASES) {
    if (result.length >= 120) break;
    if (result.length + phrase.length <= 160) {
      result += phrase;
    } else {
      // Full phrase exceeds ceiling but we are still below the 120-char floor.
      // Append a word-boundary-truncated slice to reach [120, 160].
      const available = 160 - result.length;
      const slice = phrase.slice(0, available);
      const lastSpace = slice.lastIndexOf(' ');
      const truncated = lastSpace > 0 ? slice.slice(0, lastSpace) : slice;
      let trimmedPhrase = truncated.replace(/[\s,;:.]+$/, '');
      // Strip a dangling short preposition/conjunction left by the word-boundary cut
      // (e.g. "… for" or "… and" reads poorly as a sentence tail).
      const DANGLING = new Set(['on','in','for','at','of','by','to','and','or','the','a','with']);
      const lastWord = trimmedPhrase.match(/\b(\w+)$/)?.[1];
      if (lastWord && DANGLING.has(lastWord.toLowerCase())) {
        trimmedPhrase = trimmedPhrase.slice(0, trimmedPhrase.length - lastWord.length).replace(/[\s,;:.]+$/, '');
      }
      result += trimmedPhrase;
      break;
    }
  }

  // Safety net: warn if padding still couldn't reach 120 chars (e.g. very short input).
  if (result.length < 120) {
    console.warn(
      `[applyDescriptionFloor] Description still below 120 chars after padding (${result.length}). Input: "${description}"`
    );
  }

  return result;
}

export function generateServerJsonLd(server: ServerWithTools): object {
  // Extract author/org name from GitHub URL (e.g. "https://github.com/org/repo" -> "org")
  const githubAuthor = server.github_url
    ? server.github_url.replace('https://github.com/', '').split('/')[0]
    : undefined;

  // Prefer registry published date, then our created_at
  const dateCreated = server.registry_published_at || server.created_at;

  // Best available modified date: github last push > registry updated > our updated_at
  const dateModified =
    server.github_last_push ||
    server.registry_updated_at ||
    server.updated_at;

  // Build FAQ items from available server data; emit FAQPage only if >= 2 pairs
  const faqItems: Array<{
    '@type': 'Question';
    name: string;
    acceptedAnswer: { '@type': 'Answer'; text: string };
  }> = [];

  // Q1: What is {name}?
  if (server.description && server.description.trim().length >= 20) {
    faqItems.push({
      '@type': 'Question',
      name: `What is ${server.name}?`,
      acceptedAnswer: { '@type': 'Answer', text: server.description.trim() },
    });
  }

  // Q2: How do I install {name}?
  if (server.package_url || server.github_url) {
    const clientList = 'Claude Desktop, Cursor, or VS Code';
    const installText = server.package_url
      ? `Install ${server.name} via ${server.package_type === 'npm' ? 'npm' : 'the package manager'} from ${server.package_url}, then add the server config to your MCP client (${clientList}).`
      : `Clone ${server.name} from ${server.github_url} and configure it as an MCP server in your client (${clientList}).`;
    faqItems.push({
      '@type': 'Question',
      name: `How do I install ${server.name}?`,
      acceptedAnswer: { '@type': 'Answer', text: installText },
    });
  }

  // Q3: Is {name} open source?
  // Gated on github_license being present so this doesn't overlap with Q2 for
  // servers that have a GitHub URL but no declared license.
  if (server.github_url && server.github_license) {
    const licenseText = `Yes, ${server.name} is open source under the ${server.github_license} license. Source code is available at ${server.github_url}.`;
    faqItems.push({
      '@type': 'Question',
      name: `Is ${server.name} open source?`,
      acceptedAnswer: { '@type': 'Answer', text: licenseText },
    });
  }

  // Q4: What category?
  if (server.category) {
    const catLabel = CATEGORY_LABELS[server.category as keyof typeof CATEGORY_LABELS] || server.category;
    faqItems.push({
      '@type': 'Question',
      name: `What category does ${server.name} belong to?`,
      acceptedAnswer: {
        '@type': 'Answer',
        text: `${server.name} is listed under ${catLabel} MCP servers on MCPFind.`,
      },
    });
  }

  const faqPage = faqItems.length >= 2
    ? [{ '@type': 'FAQPage', mainEntity: faqItems }]
    : [];

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: server.name,
        description: server.description || '',
        url: `${SITE_URL}/servers/${server.slug}`,
        applicationCategory: 'DeveloperApplication',
        operatingSystem: 'Cross-platform',
        version: server.version || undefined,
        downloadUrl: server.package_url || undefined,
        codeRepository: server.github_url || undefined,
        license: server.github_license
          ? `https://spdx.org/licenses/${server.github_license}`
          : undefined,
        datePublished: dateCreated || undefined,
        dateCreated: dateCreated || undefined,
        dateModified: dateModified || undefined,
        keywords:
          server.registry_tags && server.registry_tags.length > 0
            ? server.registry_tags.join(', ')
            : undefined,
        author: githubAuthor
          ? {
              '@type': 'Organization',
              name: githubAuthor,
              url: `https://github.com/${githubAuthor}`,
            }
          : undefined,
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'USD',
        },
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${SITE_URL}/servers/${server.slug}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: 'MCP Servers', item: `${SITE_URL}/servers` },
          { '@type': 'ListItem', position: 3, name: server.name, item: `${SITE_URL}/servers/${server.slug}` },
        ],
      },
      ...faqPage,
    ],
  };
}

export function generateCategoryJsonLd(
  category: string,
  categoryLabel: string,
  servers: ServerListItem[],
  /** True total count for the category (may exceed the display limit of 200).
   *  Defaults to servers.length for backward compatibility. */
  trueCount?: number,
  /** ISO date string for dateModified on the CollectionPage (most recent server update). */
  dateModified?: string,
): object {
  const faqs = CATEGORY_FAQS[category as Category] || [];
  // Use the true DB count if provided; fall back to the length of the fetched slice.
  const totalCount = trueCount ?? servers.length;

  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        name: `${categoryLabel} MCP Servers`,
        description: `Browse ${totalCount}+ ${categoryLabel.toLowerCase()} MCP servers with instant install configs.`,
        url: `${SITE_URL}/categories/${category}`,
        dateModified: dateModified,
        breadcrumb: { '@id': `${SITE_URL}/categories/${category}#breadcrumb` },
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: totalCount,
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
  const fullDesc = `Install ${server.name} in Claude Desktop, Cursor, or VS Code. ${(server.description || '').slice(0, 100)}. ${server.github_stars ? server.github_stars + '+ GitHub stars.' : ''} Open source.`;
  const serverSentences = fullDesc.split(/(?<=[.!?])\s+/);
  let description = '';
  for (const sentence of serverSentences) {
    if ((description ? description + ' ' : '').length + sentence.length > 160) break;
    description = description ? description + ' ' + sentence : sentence;
  }
  if (!description) description = fullDesc.slice(0, 157) + '...';
  description = applyDescriptionFloor(description);
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
    if ((description ? description + ' ' : '').length + sentence.length > 160) break;
    description = description ? description + ' ' + sentence : sentence;
  }
  if (!description) description = fullDesc.slice(0, 157) + '...';
  description = applyDescriptionFloor(description);
  return {
    title,
    description,
    openGraph: { title, description, url: `${SITE_URL}/categories/${category}`, siteName: SITE_NAME, type: 'website', images: [{ url: `${SITE_URL}/og-image-mcp.png`, width: 1200, height: 630, alt: `${categoryLabel} MCP Servers` }] },
    twitter: { card: 'summary_large_image', title, description },
    alternates: { canonical: `${SITE_URL}/categories/${category}` },
  };
}
