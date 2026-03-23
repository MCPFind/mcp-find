# MCP Find

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Build Status](https://img.shields.io/github/actions/workflow/status/gusmar2017/mcp-find/ci.yml?branch=main)](https://github.com/gusmar2017/mcp-find/actions)
[![GitHub Stars](https://img.shields.io/github/stars/gusmar2017/mcp-find?style=social)](https://github.com/gusmar2017/mcp-find/stargazers)

**The open-source way to find MCP servers. AI-agent optimized.**

<!-- TODO: Add screenshot of server detail page with config snippets visible -->

---

## Why this exists

The MCP ecosystem has grown to 2000+ servers, but discovering and installing them remains painful. Existing directories — Glama, PulseMCP, mcp.so — are all closed source. None of them are optimized for AI agent discovery, and none generate the copy-paste configuration snippets developers actually need.

MCP Find is the open-source alternative.

---

## What makes it different

**Open source (MIT)** — The entire stack is public. Fork it, self-host it, contribute to it.

**AI-agent optimized** — Every server page is served with semantic SSR, JSON-LD structured data, and a `/llms.txt` endpoint so AI agents and crawlers can discover and reason about servers without parsing HTML.

**Config snippet generator** — Each server detail page generates ready-to-paste JSON configuration for Claude Desktop, Cursor, VS Code, Windsurf, and Claude Code. No manual config writing.

**Trust signals** — GitHub stars, license, last commit date, and contributor count are surfaced on every server card. You can evaluate a server at a glance before installing anything.

---

## Quick start for users

1. Visit [mcpfind.org](https://mcpfind.org)
2. Search for the tool you need (e.g., "postgres", "slack", "file system")
3. Open the server detail page
4. Copy the generated config snippet for your client

---

## Quick start for developers

```bash
git clone https://github.com/gusmar2017/mcp-find.git
cd mcp-find
pnpm install
cp .env.sample .env
# Fill in your Supabase and GitHub credentials
pnpm dev
```

The web app runs at `http://localhost:3000`.

---

## Tech stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 (App Router, SSR) |
| Database | Supabase (Postgres) |
| Styling | Tailwind CSS |
| Monorepo | Turborepo |
| Language | TypeScript |
| Hosting | Vercel |

---

## Project structure

```
mcp-find/
├── apps/
│   └── web/               # Next.js 14 web application
├── packages/
│   ├── shared/            # Shared types, schemas, and constants
│   ├── mcp-server/        # @mcpfind/server npm package
│   └── sync/              # GitHub metadata sync worker
├── community-servers.yml  # Community-submitted server registry
└── supabase/              # Database migrations and config
```

---

## MCP Server

The `@mcpfind/server` package lets AI agents query the directory programmatically via MCP.

Install:

```bash
npx @mcpfind/server
```

The server exposes three tools:

| Tool | Description |
|------|-------------|
| `search_servers` | Search the directory by query, category, and sort order |
| `get_server_details` | Get full metadata, tool schemas, and README for a specific server |
| `get_install_config` | Generate a copy-paste install config for a given client (Claude Desktop, Cursor, etc.) |

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for the full guide.

To submit a new server, add an entry to `community-servers.yml` and open a pull request. Servers must be open source, published to a package registry, and include at least one MCP tool.

---

## API

The web app exposes three primary API endpoints:

| Endpoint | Description |
|----------|-------------|
| `GET /api/servers` | List and search servers with pagination and filters |
| `GET /api/servers/[slug]` | Get full detail for a single server |
| `GET /llms.txt` | Plain-text server index for AI crawlers |

---

## License

MIT. See [LICENSE](./LICENSE).

---

Built by Gus and Adam in a week.
