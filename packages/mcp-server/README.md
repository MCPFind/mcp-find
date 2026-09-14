# MCPFind MCP Server

`@mcpfind/server` is an MCP server for searching the [MCPFind](https://mcpfind.org)
directory and generating client-specific installation configuration for the servers it
lists. It communicates over stdio and requires Node.js 18 or later.

## Client configuration

Add the following configuration to an MCP client that supports local stdio servers:

```json
{
  "mcpServers": {
    "mcpfind": {
      "command": "npx",
      "args": ["-y", "@mcpfind/server"]
    }
  }
}
```

The command downloads and starts the published package when the client connects. To
run an already installed copy, use its `mcpfind` executable instead.

## Tools

| Tool | Inputs | Result |
| --- | --- | --- |
| `search_servers` | `query` (required); optional `category`, `sort_by`, and `limit` from 1 through 20 | Matching directory entries with metadata, GitHub statistics, and package type. |
| `get_server_details` | `server_id` (required) | Full directory record, exposed tool metadata, and a README excerpt for one server. |
| `get_install_config` | `server_id` and `client` (both required) | A copy-paste MCP client configuration for Claude Desktop, Cursor, VS Code, Windsurf, or Claude Code. |

An unknown server returns an MCP tool error with a descriptive message. Upstream API
failures also return MCP tool errors, allowing clients to show an actionable failure
without losing the stdio session.

## Configuration

By default the server queries `https://mcpfind.org/api`. Set `MCPFIND_API_URL` to use
another compatible API endpoint, for example when running against a local MCPFind
development environment:

```bash
MCPFIND_API_URL=http://localhost:3000/api npx -y @mcpfind/server
```

Each upstream request has a 10-second timeout.

## Development

From the repository root, install dependencies and build the server:

```bash
pnpm install --frozen-lockfile
pnpm --filter @mcpfind/server build
pnpm --filter @mcpfind/server test:protocol
pnpm --filter @mcpfind/server test:docs
```

The protocol test starts the compiled server over stdio against a local API fixture.
It verifies tool discovery, request schemas, successful tool calls, and an expected
not-found error. The documentation test verifies that this README's configuration and
tool inventory match the built package.
