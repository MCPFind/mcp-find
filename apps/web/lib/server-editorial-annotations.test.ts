import { describe, expect, it } from "vitest";
import {
  EDITORIAL_ANNOTATION_CHECKED_AT,
  getServerEditorialAnnotation,
  SERVER_EDITORIAL_ANNOTATIONS,
} from "./server-editorial-annotations";

const annotatedSlugs = [
  "io-elevenlabs-mcp",
  "io-github-asklokesh-xero-mcp-server",
  "io-github-neverinfamous-mysql-mcp",
  "io-github-acedatacloud-mcp-seedream-pro",
  "com-monday-monday-com",
  "io-github-aras-workspace-claude-kvm",
];

describe("server editorial annotations", () => {
  it("has exactly the six approved, source-linked annotations", () => {
    expect(Object.keys(SERVER_EDITORIAL_ANNOTATIONS).sort()).toEqual([...annotatedSlugs].sort());
    for (const slug of annotatedSlugs) {
      const annotation = getServerEditorialAnnotation(slug);
      expect(annotation).toBeDefined();
      expect(annotation?.sourceUrl).toMatch(/^https:\/\//);
      expect(annotation?.reviewBoundary).toContain("Docs-derived");
    }
  });

  it("leaves every unapproved listing unannotated", () => {
    expect(getServerEditorialAnnotation("com-example-unrelated")).toBeUndefined();
  });

  it("keeps a visible review date", () => {
    expect(EDITORIAL_ANNOTATION_CHECKED_AT).toBe("2026-10-17");
  });
});
