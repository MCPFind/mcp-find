import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import type { BlogPost, BlogFrontmatter } from '@/types/blog';

const CONTENT_DIR = path.join(process.cwd(), 'content/blog');

function calculateReadingTime(content: string): number {
  const stripped = content
    .replace(/^---[\s\S]*?---/, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<[^>]+>/g, '');
  const words = stripped.split(/\s+/).filter(Boolean).length;
  return Math.ceil(words / 200);
}

export function getAllPosts(options?: { limit?: number; offset?: number }): BlogPost[] {
  if (!fs.existsSync(CONTENT_DIR)) return [];

  const files = fs.readdirSync(CONTENT_DIR).filter(f => f.endsWith('.mdx'));

  let posts = files.map(filename => {
    const slug = filename.replace(/\.mdx$/, '');
    const filePath = path.join(CONTENT_DIR, filename);
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const { data, content } = matter(fileContent);

    return {
      slug,
      frontmatter: data as BlogFrontmatter,
      content,
      readingTime: calculateReadingTime(content),
    };
  });

  // Filter drafts in production
  if (process.env.NODE_ENV === 'production') {
    posts = posts.filter(p => !p.frontmatter.draft);
  }

  // Sort by date descending
  posts.sort((a, b) => new Date(b.frontmatter.date).getTime() - new Date(a.frontmatter.date).getTime());

  // Apply pagination
  if (options?.offset) {
    posts = posts.slice(options.offset);
  }
  if (options?.limit) {
    posts = posts.slice(0, options.limit);
  }

  return posts;
}

export function getPostBySlug(slug: string): BlogPost | null {
  // Positive validation
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) return null;

  // Strip path separators
  const sanitized = slug.replace(/[/\\]/g, '');
  if (sanitized.includes('..')) return null;

  const filePath = path.resolve(CONTENT_DIR, `${sanitized}.mdx`);

  // Verify path is within content directory
  if (!filePath.startsWith(path.resolve(CONTENT_DIR))) return null;

  if (!fs.existsSync(filePath)) return null;

  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const { data, content } = matter(fileContent);

  return {
    slug: sanitized,
    frontmatter: data as BlogFrontmatter,
    content,
    readingTime: calculateReadingTime(content),
  };
}

export function getPostSlugs(): string[] {
  if (!fs.existsSync(CONTENT_DIR)) return [];
  return fs.readdirSync(CONTENT_DIR)
    .filter(f => f.endsWith('.mdx'))
    .map(f => f.replace(/\.mdx$/, ''));
}

export function getRelatedPosts(post: BlogPost, count: number = 3): BlogPost[] {
  const allPosts = getAllPosts();
  return allPosts
    .filter(p => p.slug !== post.slug)
    .map(p => ({
      ...p,
      score: p.frontmatter.tags.filter(t => post.frontmatter.tags.includes(t)).length,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, count);
}

export { calculateReadingTime };
