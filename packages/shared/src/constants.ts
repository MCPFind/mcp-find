import type { ClientType } from './types';

export const SITE_NAME = 'MCP Find';
export const SITE_URL = 'https://mcpfind.org';
export const SITE_DESCRIPTION = 'The open-source way to find MCP servers. AI-agent optimized.';
export const REPO_URL = 'https://github.com/gusmar2017/mcp-find';

export const REGISTRY_API_BASE = 'https://registry.modelcontextprotocol.io';
export const REGISTRY_SERVERS_ENDPOINT = '/v0/servers';
export const REGISTRY_PAGE_SIZE = 100;

export const GITHUB_API_BASE = 'https://api.github.com';
export const GITHUB_RATE_DELAY_MS = 800;

export const API_RATE_LIMIT = 100; // requests per minute per IP
export const MCP_RATE_LIMIT = 30;  // requests per minute per connection

export const DEFAULT_PAGE_SIZE = 24;
export const MAX_PAGE_SIZE = 100;

export const OFFICIAL_SCOPES = ['@modelcontextprotocol/', '@anthropic/'];

export const CLIENT_CONFIGS: Record<ClientType, {
  topLevelKey: string;
  filePath: { macos: string; windows: string; linux: string };
  postInstall: string;
}> = {
  'claude-desktop': {
    topLevelKey: 'mcpServers',
    filePath: {
      macos: '~/Library/Application Support/Claude/claude_desktop_config.json',
      windows: '%APPDATA%\\Claude\\claude_desktop_config.json',
      linux: '~/.config/Claude/claude_desktop_config.json',
    },
    postInstall: 'Restart Claude Desktop completely for changes to take effect.',
  },
  cursor: {
    topLevelKey: 'mcpServers',
    filePath: {
      macos: '~/.cursor/mcp.json',
      windows: '%USERPROFILE%\\.cursor\\mcp.json',
      linux: '~/.cursor/mcp.json',
    },
    postInstall: 'Restart Cursor for changes to take effect.',
  },
  vscode: {
    topLevelKey: 'servers',
    filePath: {
      macos: '.vscode/mcp.json',
      windows: '.vscode\\mcp.json',
      linux: '.vscode/mcp.json',
    },
    postInstall: 'Reload VS Code window for changes to take effect.',
  },
  windsurf: {
    topLevelKey: 'mcpServers',
    filePath: {
      macos: '~/.codeium/windsurf/mcp_config.json',
      windows: '%USERPROFILE%\\.codeium\\windsurf\\mcp_config.json',
      linux: '~/.codeium/windsurf/mcp_config.json',
    },
    postInstall: 'Restart Windsurf for changes to take effect.',
  },
  'claude-code': {
    topLevelKey: 'mcpServers',
    filePath: {
      macos: '~/.claude.json',
      windows: '~/.claude.json',
      linux: '~/.claude.json',
    },
    postInstall: 'Restart Claude Code for changes to take effect.',
  },
};
