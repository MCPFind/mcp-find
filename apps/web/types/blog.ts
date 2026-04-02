export interface BlogFrontmatter {
  title: string;
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
  faqItems?: Array<{ question: string; answer: string }>;
  cornerstone?: boolean;
}

export interface BlogPost {
  slug: string;
  frontmatter: BlogFrontmatter;
  content: string;
  readingTime: number;
}
