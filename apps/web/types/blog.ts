export interface BlogFrontmatter {
  title: string;
  /** Short title for <title> tag (≤60 chars). Overrides `title` in metadata only;
   *  the full `title` is still used for the H1 and Open Graph heading.
   *  Use this on posts whose display title exceeds 60 chars. */
  seoTitle?: string;
  description: string;
  excerpt?: string;
  date: string;
  updatedAt?: string;
  author: string;
  authorUrl?: string;
  authorSameAs?: string[];
  tags: string[];
  category?: string;
  image?: string;
  canonicalUrl?: string;
  focusKeyword?: string;
  draft?: boolean;
  noindex?: boolean;
  faqItems?: Array<{ question: string; answer: string }>;
  howToSteps?: Array<{ name: string; text: string }>;
  howToName?: string;
  howToDescription?: string;
  howToTotalTime?: string;
  cornerstone?: boolean;
}

export interface BlogPost {
  slug: string;
  frontmatter: BlogFrontmatter;
  content: string;
  readingTime: number;
}
