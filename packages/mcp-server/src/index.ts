#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { searchServers, getServerDetails, getInstallConfig } from './client.js';
import { CATEGORIES } from '@mcpfind/shared';
import type { ClientType } from '@mcpfind/shared';

const server = new McpServer({
  name: 'mcpfind',
  version: '0.1.0',
});

// Tool 1: search_servers
server.tool(
  'search_servers',
  'Search the MCP server directory. Returns matching servers with metadata, GitHub stats, and install info.',
  {
    query: z.string().describe('Search query (e.g., "postgres", "slack", "file system")'),
    category: z.enum(CATEGORIES).optional().describe('Filter by category'),
    sort_by: z.enum(['stars', 'updated', 'name', 'downloads']).optional().default('stars').describe('Sort results'),
    limit: z.number().min(1).max(20).optional().default(10).describe('Max results (1-20)'),
  },
  async ({ query, category, sort_by, limit }) => {
    try {
      const servers = await searchServers({ query, category, sort_by, limit });
      const results = servers.map(s => ({
        name: s.name,
        slug: s.slug,
        description: s.description ?? '',
        category: s.category,
        stars: s.github_stars,
        license: s.github_license,
        package_type: s.package_type,
        is_official: s.is_official,
      }));
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(results, null, 2) }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  }
);

// Tool 2: get_server_details
server.tool(
  'get_server_details',
  'Get full details for a specific MCP server including description, tools, schemas, GitHub stats, and README content.',
  {
    server_id: z.string().describe('Server slug or registry ID'),
  },
  async ({ server_id }) => {
    try {
      const detail_server = await getServerDetails(server_id);
      if (!detail_server) {
        return {
          content: [{ type: 'text' as const, text: `Server "${server_id}" not found.` }],
          isError: true,
        };
      }
      const detail = {
        name: detail_server.name,
        slug: detail_server.slug,
        description: detail_server.description,
        category: detail_server.category,
        version: detail_server.version,
        package_name: detail_server.package_name,
        package_type: detail_server.package_type,
        github_url: detail_server.github_url,
        github_stars: detail_server.github_stars,
        github_license: detail_server.github_license,
        github_last_push: detail_server.github_last_push,
        is_official: detail_server.is_official,
        tools: (detail_server.tools ?? []).map(t => ({
          name: t.tool_name,
          description: t.tool_description,
          input_schema: t.input_schema,
        })),
        readme_excerpt: detail_server.readme_content?.slice(0, 2000) || null,
      };
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(detail, null, 2) }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  }
);

// Tool 3: get_install_config
server.tool(
  'get_install_config',
  'Generate the JSON configuration snippet needed to install an MCP server in a specific client (Claude Desktop, Cursor, VS Code, Windsurf, or Claude Code).',
  {
    server_id: z.string().describe('Server slug or registry ID'),
    client: z.enum(['claude-desktop', 'cursor', 'vscode', 'windsurf', 'claude-code']).describe('Target client'),
  },
  async ({ server_id, client }) => {
    try {
      const config = await getInstallConfig(server_id, client as ClientType);
      if (!config) {
        return {
          content: [{ type: 'text' as const, text: `Server "${server_id}" not found or has no package info.` }],
          isError: true,
        };
      }
      return {
        content: [{ type: 'text' as const, text: JSON.stringify(config, null, 2) }],
      };
    } catch (err) {
      return {
        content: [{ type: 'text' as const, text: `Error: ${err instanceof Error ? err.message : String(err)}` }],
        isError: true,
      };
    }
  }
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
