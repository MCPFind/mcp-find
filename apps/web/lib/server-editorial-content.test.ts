import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const contentDir = path.join(process.cwd(), "content/blog");
const guides = {
  "elevenlabs-mcp-server-voice-ai.mdx": [
    "updatedAt: \"2026-10-17\"",
    "https://github.com/elevenlabs/plugin",
    "hosted MCP server",
    "OAuth",
    "different route",
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
    "updatedAt: \"2026-10-17\"",
    "https://github.com/mondaycom/mcp",
    "hosted MCP route",
    "Docs reviewed October 17, 2026",
  ],
};

describe("targeted editorial guide source guards", () => {
  it("keeps the four approved guides source-linked and review-dated", () => {
    for (const [filename, requiredText] of Object.entries(guides)) {
      const source = fs.readFileSync(path.join(contentDir, filename), "utf8");
      for (const text of requiredText) expect(source).toContain(text);
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
