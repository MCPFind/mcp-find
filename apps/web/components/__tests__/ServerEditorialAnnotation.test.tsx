import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ServerEditorialAnnotation } from "../ServerEditorialAnnotation";
import { getServerEditorialAnnotation } from "@/lib/server-editorial-annotations";

const annotatedSlugs = [
  "io-elevenlabs-mcp",
  "io-github-asklokesh-xero-mcp-server",
  "io-github-neverinfamous-mysql-mcp",
  "io-github-acedatacloud-mcp-seedream-pro",
  "com-monday-monday-com",
  "io-github-aras-workspace-claude-kvm",
];

describe("ServerEditorialAnnotation", () => {
  it("renders each approved annotation with source and docs-derived disclosure", () => {
    for (const slug of annotatedSlugs) {
      const annotation = getServerEditorialAnnotation(slug);
      expect(annotation).toBeDefined();
      const html = renderToStaticMarkup(
        <ServerEditorialAnnotation annotation={annotation!} />,
      );
      expect(html).toContain(annotation!.title);
      expect(html).toContain(`href="${annotation!.sourceUrl}"`);
      expect(html).toContain("Docs reviewed 2026-10-17; not independently tested by MCPFind.");
    }
  });
});
