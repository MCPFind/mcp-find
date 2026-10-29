import fs from "node:fs";
import path from "node:path";
import matter from "gray-matter";
import { describe, expect, it } from "vitest";

const contentDir = path.join(process.cwd(), "content/blog");
const secondBatchGuides = {
  "github-mcp-server-claude-code-tutorial.mdx": [
    "https://api.githubcopilot.com/mcp",
    "/servers/io-github-github-github-mcp-server",
    "OAuth",
  ],
  "figma-mcp-server-design-to-code.mdx": [
    "https://mcp.figma.com/mcp",
    "http://127.0.0.1:3845/mcp",
    "/servers/com-figma-mcp-mcp",
  ],
  "stripe-mcp-server-guide.mdx": [
    "https://mcp.stripe.com",
    "agent API keys",
    "/servers/com-stripe-mcp",
  ],
  "supabase-mcp-server-deep-dive.mdx": [
    "https://mcp.supabase.com/mcp?project_ref=YOUR_PROJECT_REF&read_only=true&features=database,docs",
    "https://supabase.com/docs/guides/self-hosting/enable-mcp",
    "/servers/com-supabase-mcp",
  ],
  "cloudflare-mcp-server-workers-guide.mdx": [
    "https://mcp.cloudflare.com/mcp",
    "Streamable HTTP",
    "/servers/com-cloudflare-mcp-mcp",
  ],
};

const guides = {
  "elevenlabs-mcp-server-voice-ai.mdx": [
    "updatedAt: \"2026-10-29\"",
    "https://github.com/elevenlabs/plugin",
    "hosted MCP server",
    "OAuth",
    "separate implementations",
  ],
  "mysql-mcp-server-setup-guide.mdx": [
    "updatedAt: \"2026-10-17\"",
    "@neverinfamous/mysql-mcp",
    "https://github.com/neverinfamous/mysql-mcp",
    "Docs reviewed October 17, 2026",
  ],
  "mcp-for-accountants-quickbooks-xero.mdx": [
    "updatedAt: \"2026-10-17\"",
    "https://github.com/asklokesh/xero-mcp-server",
    "organisation selection",
    "Docs reviewed October 17, 2026",
  ],
  "monday-mcp-server-ai-agents.mdx": [
    "updatedAt: \"2026-10-29\"",
    "https://github.com/mondaycom/mcp",
    "hosted MCP route",
    "Docs reviewed October 29, 2026",
  ],
};

describe("targeted editorial guide source guards", () => {
  it("keeps the four approved guides source-linked and review-dated", () => {
    for (const [filename, requiredText] of Object.entries(guides)) {
      const source = fs.readFileSync(path.join(contentDir, filename), "utf8");
      for (const text of requiredText) expect(source).toContain(text);
    }
  });

  it("keeps second-batch guides dated, source-reconciled, and free of duplicate FAQ bodies", () => {
    for (const [filename, requiredText] of Object.entries(secondBatchGuides)) {
      const source = fs.readFileSync(path.join(contentDir, filename), "utf8");
      const { data, content } = matter(source);
      const corrected = ["github-mcp-server-claude-code-tutorial.mdx", "supabase-mcp-server-deep-dive.mdx"].includes(filename);
      expect(data.updatedAt).toBe(corrected ? "2026-10-29" : "2026-10-17");
      expect(data.faqItems.length).toBeGreaterThan(0);
      expect(content).toContain(`Docs reviewed October ${corrected ? "29" : "17"}, 2026`);
      expect(content).toContain("docs-derived; MCPFind did not");
      expect(content).not.toMatch(/^## Frequently Asked Questions/m);
      for (const text of requiredText) expect(source).toContain(text);
      for (const faq of data.faqItems) expect(content).not.toContain(`### ${faq.question}`);
    }
  });

  it("keeps ElevenLabs FAQ metadata consistent with visible answers", () => {
    const source = fs.readFileSync(path.join(contentDir, "elevenlabs-mcp-server-voice-ai.mdx"), "utf8");
    const { data, content } = matter(source);
    for (const faq of data.faqItems) {
      expect(content).toContain(`### ${faq.question}\n\n${faq.answer}`);
    }
  });

  it("does not put the previous generic MySQL package back in the setup command", () => {
    const source = fs.readFileSync(
      path.join(contentDir, "mysql-mcp-server-setup-guide.mdx"),
      "utf8",
    );
    expect(source).not.toContain('"args": ["-y", "mcp-server-mysql"]');
  });
});
