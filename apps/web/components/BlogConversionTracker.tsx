"use client";

/**
 * BlogConversionTracker — Client Component
 *
 * Attaches a single delegated click listener to its children wrapper.
 * When a click bubbles up, it walks the DOM to find the nearest
 * [data-conversion="blog_to_servers_click"] ancestor and fires the GA4 event.
 *
 * This avoids any modification to the Server Component (RelatedServersForCategory)
 * while respecting the existing data-conversion / data-source / data-target /
 * data-category attribute contract.
 */

import { useCallback, type ReactNode } from "react";
import { trackBlogToServersClick } from "@/lib/analytics";

interface BlogConversionTrackerProps {
  children: ReactNode;
  blogSlug?: string;
  category?: string;
}

export function BlogConversionTracker({ children, blogSlug = "", category = "" }: BlogConversionTrackerProps) {
  const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!(e.target instanceof Element)) return;
    const target = e.target;
    const conversionEl = target.closest<HTMLElement>("[data-conversion='blog_to_servers_click']");
    const anchor = target.closest<HTMLAnchorElement>("a[href]");
    if (!anchor) return;
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin) return;
    const match = /^\/servers\/([a-z0-9][a-z0-9-]*)\/?$/.exec(url.pathname);
    if (!match?.[1]) return;
    trackBlogToServersClick({
      blog_slug: conversionEl?.dataset["source"] || blogSlug,
      server_slug: conversionEl?.dataset["target"] || match[1],
      category: conversionEl?.dataset["category"] || category,
    });
  }, [blogSlug, category]);

  return (
    <div onClick={handleClick}>
      {children}
    </div>
  );
}
