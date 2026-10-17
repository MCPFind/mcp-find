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
  "io-github-github-github-mcp-server": {
    title: "Scope repository access before enabling writes",
    sourceLabel: "GitHub MCP server documentation",
    sourceUrl: "https://github.com/github/github-mcp-server",
    decision:
      "The official hosted endpoint is https://api.githubcopilot.com/mcp. GitHub documents a personal access token in the Authorization header for remote Claude Code. OAuth depends on the client and its registered application. Review repository permissions and organization restrictions, and enable only the toolsets needed, using read-only mode for a lookup workflow.",
    workflow:
      "Ask for the title, state, and link of one known issue in a named repository, then compare the result with GitHub. If the repository is unavailable, review organization policy and account access before increasing permissions.",
    reviewBoundary:
      "Docs-derived; MCPFind did not authenticate or read a repository. Review the target repository and proposed change before permitting comments, issue edits, or pull-request actions.",
    guideHref: "/blog/github-mcp-server-claude-code-tutorial",
    guideLabel: "Read the GitHub setup guide",
  },
  "com-figma-mcp-mcp": {
    title: "Choose hosted access or the eligible desktop route",
    sourceLabel: "Figma MCP server documentation",
    sourceUrl: "https://developers.figma.com/docs/figma-mcp-server/",
    decision:
      "Figma documents remote OAuth at https://mcp.figma.com/mcp. The desktop alternative at http://127.0.0.1:3845/mcp requires the Figma desktop app and an eligible plan with a Dev or Full seat. A personal-token npm wrapper is a separate implementation.",
    workflow:
      "Provide one frame link and ask for its design context and an implementation plan using existing components. Compare spacing, typography, and assets against that frame before accepting generated code or expanding to a whole page.",
    reviewBoundary:
      "Docs-derived; MCPFind did not connect to a Figma file or compare generated code with a design. Review file access and tool permissions; approve any canvas changes separately.",
    guideHref: "/blog/figma-mcp-server-design-to-code",
    guideLabel: "Read the Figma design-to-code guide",
  },
  "com-stripe-mcp": {
    title: "Separate payment lookup from financial changes",
    sourceLabel: "Stripe MCP documentation",
    sourceUrl: "https://docs.stripe.com/mcp",
    decision:
      "Stripe's hosted endpoint is https://mcp.stripe.com. OAuth suits interactive access on behalf of a user; agent API keys support independent, persistent access. Begin in a sandbox with only the permissions required for a read-only task.",
    workflow:
      "Choose one known sandbox customer or invoice and ask for its ID and status. Compare that result with the sandbox Dashboard before widening the lookup. A refund, subscription change, or other mutation needs a separate, explicit human approval of the account, object, and intended effect.",
    reviewBoundary:
      "Docs-derived; MCPFind did not authorize Stripe, inspect payment data, or execute a financial operation. Confirm environment and permissions before use; a prompt alone is not an access control.",
    guideHref: "/blog/stripe-mcp-server-guide",
    guideLabel: "Read the Stripe access and review guide",
  },
  "com-supabase-mcp": {
    title: "Constrain the project and tool groups first",
    sourceLabel: "Supabase MCP documentation",
    sourceUrl: "https://supabase.com/docs/guides/ai-tools/mcp",
    decision:
      "The hosted route at https://mcp.supabase.com/mcp uses OAuth with dynamic client registration. Scope the connection to one project, enable read-only mode, and select only the feature groups needed. A scoped PAT is the documented alternative for CI; the available tools depend on configuration.",
    workflow:
      "Use a development project and ask for the table names in one schema, without reading rows or applying SQL changes. Compare the names with the Dashboard. Review a proposed migration and its target separately before authorizing any write.",
    reviewBoundary:
      "Docs-derived; MCPFind did not connect to Supabase or execute SQL. Read-only mode still permits data exposure. Follow the separate self-hosting documentation rather than substituting a service-role key into the hosted configuration.",
    guideHref: "/blog/supabase-mcp-server-deep-dive",
    guideLabel: "Read the Supabase project-scoping guide",
  },
  "com-cloudflare-mcp-mcp": {
    title: "Confirm account and permissions before infrastructure changes",
    sourceLabel: "Cloudflare MCP server documentation",
    sourceUrl:
      "https://developers.cloudflare.com/agents/model-context-protocol/cloudflare/servers-for-cloudflare/",
    decision:
      "Cloudflare documents its hosted API MCP endpoint at https://mcp.cloudflare.com/mcp using Streamable HTTP. Use OAuth for interactive access or a scoped user/account bearer token for automation. Legacy local stdio and /sse examples are not the default route.",
    workflow:
      "Select the intended account and ask for the name and deployment information of one known Worker without changing it. Compare the result with the Dashboard, then review the target, diff, and rollback plan before approving a deployment or other mutation.",
    reviewBoundary:
      "Docs-derived; MCPFind did not authorize Cloudflare or deploy infrastructure. Review account, zone, resource permissions, and any costs before granting write access.",
    guideHref: "/blog/cloudflare-mcp-server-workers-guide",
    guideLabel: "Read the Cloudflare Workers workflow guide",
  },
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
