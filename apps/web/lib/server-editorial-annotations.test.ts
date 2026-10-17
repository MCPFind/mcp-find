import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RelatedArticles } from "../components/related-articles";
import {
  EDITORIAL_ANNOTATION_CHECKED_AT,
  getServerEditorialAnnotation,
  SERVER_EDITORIAL_ANNOTATIONS,
} from "./server-editorial-annotations";

const annotatedSlugs = [
  "ai-smithery-brave",
  "io-github-firecrawl-firecrawl-mcp-server",
  "io-github-googleapis-mcp-toolbox",
  "com-zapier-mcp",
  "ai-exa-exa",
  "io-github-github-github-mcp-server",
  "com-figma-mcp-mcp",
  "com-stripe-mcp",
  "com-supabase-mcp",
  "com-cloudflare-mcp-mcp",
  "io-elevenlabs-mcp",
  "io-github-asklokesh-xero-mcp-server",
  "io-github-neverinfamous-mysql-mcp",
  "io-github-acedatacloud-mcp-seedream-pro",
  "com-monday-monday-com",
  "io-github-aras-workspace-claude-kvm",
];

describe("server editorial annotations", () => {
  it("has exactly the sixteen approved, source-linked annotations", () => {
    expect(Object.keys(SERVER_EDITORIAL_ANNOTATIONS).sort()).toEqual([...annotatedSlugs].sort());
    for (const slug of annotatedSlugs) {
      const annotation = getServerEditorialAnnotation(slug);
      expect(annotation).toBeDefined();
      expect(annotation?.sourceUrl).toMatch(/^https:\/\//);
      expect(annotation?.reviewBoundary).toContain("Docs-derived");
    }
  });

  it("keeps each second-batch guide paired with its exact listing", async () => {
    const pairs = {
      "io-github-github-github-mcp-server": "github-mcp-server-claude-code-tutorial",
      "com-figma-mcp-mcp": "figma-mcp-server-design-to-code",
      "com-stripe-mcp": "stripe-mcp-server-guide",
      "com-supabase-mcp": "supabase-mcp-server-deep-dive",
      "com-cloudflare-mcp-mcp": "cloudflare-mcp-server-workers-guide",
    };
    for (const [serverSlug, guideSlug] of Object.entries(pairs)) {
      expect(getServerEditorialAnnotation(serverSlug)?.guideHref).toBe(`/blog/${guideSlug}`);
      const articles = await RelatedArticles({ serverSlug, serverCategory: "unrelated-category" });
      const markup = renderToStaticMarkup(articles);
      expect(markup).toContain(`href="/blog/${guideSlug}"`);
      expect(markup.match(/href="\/blog\//g)).toHaveLength(1);
    }
  });

  it("keeps each third-batch guide paired with its exact listing", async () => {
    const pairs = {
      "ai-smithery-brave": "brave-search-mcp-server-setup-guide",
      "io-github-firecrawl-firecrawl-mcp-server": "firecrawl-mcp-server-web-scraping-guide",
      "io-github-googleapis-mcp-toolbox": "bigquery-mcp-server-google-cloud-guide",
      "com-zapier-mcp": "zapier-mcp-server-automation-guide",
      "ai-exa-exa": "exa-mcp-server-ai-search-guide",
    };
    for (const [serverSlug, guideSlug] of Object.entries(pairs)) {
      expect(getServerEditorialAnnotation(serverSlug)?.guideHref).toBe(`/blog/${guideSlug}`);
      const articles = await RelatedArticles({ serverSlug, serverCategory: "unrelated-category" });
      const markup = renderToStaticMarkup(articles);
      expect(markup).toContain(`href="/blog/${guideSlug}"`);
      expect(markup.match(/href="\/blog\//g)).toHaveLength(1);
    }
  });

  it("leaves every unapproved listing unannotated", () => {
    expect(getServerEditorialAnnotation("com-example-unrelated")).toBeUndefined();
  });

  it("keeps a visible review date", () => {
    expect(EDITORIAL_ANNOTATION_CHECKED_AT).toBe("2026-10-17");
  });
});
