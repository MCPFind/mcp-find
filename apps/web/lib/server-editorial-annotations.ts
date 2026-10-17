export const EDITORIAL_ANNOTATION_CHECKED_AT = "2026-10-17";

export type ServerEditorialAnnotation = {
  title: string;
  sourceLabel: string;
  sourceUrl: string;
  decision: string;
  workflow: string;
  reviewBoundary: string;
  guideHref?: string;
  guideLabel?: string;
};

/**
 * Curated, source-linked additions for a small set of listings. These notes
 * deliberately supplement the upstream README rather than restating it.
 */
export const SERVER_EDITORIAL_ANNOTATIONS: Readonly<
  Record<string, ServerEditorialAnnotation>
> = {
  "io-elevenlabs-mcp": {
    title: "Choose the hosted connection before a local wrapper",
    sourceLabel: "ElevenLabs plugin documentation",
    sourceUrl: "https://github.com/elevenlabs/plugin",
    decision:
      "The official plugin documents a hosted MCP server that signs in through OAuth, with no local install or API key for that route. A local API-key wrapper can still be useful when its documented tools are the requirement; it is a separate setup path, not a replacement for the hosted one.",
    workflow:
      "For agent management or text-to-speech, connect the hosted endpoint, finish the ElevenLabs OAuth sign-in, then confirm the account and the tool scope before asking the agent to change an agent or generate audio.",
    reviewBoundary:
      "Docs-derived; MCPFind did not run this connection or generate audio. Review account permissions and current service terms before a real operation.",
    guideHref: "/blog/elevenlabs-mcp-server-voice-ai",
    guideLabel: "Read the ElevenLabs setup guide",
  },
  "io-github-asklokesh-xero-mcp-server": {
    title: "Treat this Xero connector as a community package",
    sourceLabel: "asklokesh/xero-mcp-server README",
    sourceUrl: "https://github.com/asklokesh/xero-mcp-server",
    decision:
      "The listing points to a community repository and its README describes environment-based configuration rather than a hosted Xero connection. Check its maintenance state and the exact package before putting client data behind it.",
    workflow:
      "The README supports local package installation and environment-based configuration only. For authorization, organisation selection, and available reports, use the provider's current documentation before configuring client data.",
    reviewBoundary:
      "Docs-derived; MCPFind did not configure the package or query accounting data. Keep credentials out of shared configuration and review the provider's current documentation before use.",
    guideHref: "/blog/mcp-for-accountants-quickbooks-xero",
    guideLabel: "Read the accounting workflow guide",
  },
  "io-github-neverinfamous-mysql-mcp": {
    title: "Match the package to this listing before connecting data",
    sourceLabel: "neverinfamous/mysql-mcp README",
    sourceUrl: "https://github.com/neverinfamous/mysql-mcp",
    decision:
      "This listing is for `@neverinfamous/mysql-mcp`; its README documents both a local stdio command and HTTP-oriented deployment options. Do not substitute a generic MySQL package and assume the same tools or controls.",
    workflow:
      "Start with a dedicated, least-privilege database account, use a replica when practical, and begin with a bounded read-only question such as listing one schema. Review the returned rows before widening the query or allowing changes.",
    reviewBoundary:
      "Docs-derived; MCPFind did not connect to a database or execute SQL. Confirm the server's current connection, transport, and authorization settings with the maintainer documentation.",
    guideHref: "/blog/mysql-mcp-server-setup-guide",
    guideLabel: "Read the MySQL setup guide",
  },
  "io-github-acedatacloud-mcp-seedream-pro": {
    title: "Choose one credential route and follow the task result",
    sourceLabel: "AceDataCloud/SeedreamMCP README",
    sourceUrl: "https://github.com/AceDataCloud/SeedreamMCP",
    decision:
      "The maintainer documents hosted OAuth, a hosted bearer token, and local stdio as separate routes. Hosted OAuth avoids pasting a token into client configuration; do not configure both OAuth and a fixed authorization header for the same server.",
    workflow:
      "Choose the model and size from the documented capability list, submit one low-stakes image request, then use the task-status tool to retrieve its result. Review displayed pricing before a metered operation.",
    reviewBoundary:
      "Docs-derived; MCPFind did not authorize an account, submit an image request, or verify pricing. Confirm current model availability and account limits in the provider documentation.",
  },
  "com-monday-monday-com": {
    title: "Use hosted OAuth for the normal board workflow",
    sourceLabel: "monday.com MCP documentation",
    sourceUrl: "https://github.com/mondaycom/mcp",
    decision:
      "monday.com recommends its hosted MCP for a no-install OAuth route with workspace controls. Its local package uses a personal API token and is documented for local customization, offline development, or contribution work.",
    workflow:
      "Connect the hosted endpoint, approve access only to the workspace required, then ask for the items on one board before asking the agent to create or update anything. Review the proposed board and item before a write action.",
    reviewBoundary:
      "Docs-derived; MCPFind did not connect an account or modify a board. Verify the current workspace controls and tool permissions before enabling writes.",
    guideHref: "/blog/monday-mcp-server-ai-agents",
    guideLabel: "Read the monday.com workflow guide",
  },
  "io-github-aras-workspace-claude-kvm": {
    title: "Keep the first remote-desktop trial observable",
    sourceLabel: "ARAS-Workspace/claude-kvm README",
    sourceUrl: "https://github.com/ARAS-Workspace/claude-kvm",
    decision:
      "This macOS integration combines a local MCP proxy and native VNC daemon with a remote VNC server. Its documented configuration includes the VNC host, port, username, password, and daemon path, so the connection has real desktop-control scope.",
    workflow:
      "Use an isolated, non-sensitive target for the first trial. Ask the agent to capture the screen and make one reversible interaction, then inspect the visible result before giving it a broader desktop task.",
    reviewBoundary:
      "Docs-derived; MCPFind did not install the daemon, expose VNC, or control a desktop. Store credentials outside shared project files and confirm network exposure before use.",
  },
};

export function getServerEditorialAnnotation(slug: string) {
  return SERVER_EDITORIAL_ANNOTATIONS[slug];
}
