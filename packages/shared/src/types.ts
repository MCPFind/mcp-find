import type { Category } from './categories';

export type { Category };

export type PackageType = 'npm' | 'pypi' | 'docker' | 'other';

export type ClientType = 'claude-desktop' | 'cursor' | 'vscode' | 'windsurf' | 'claude-code';

export type SortOption = 'stars' | 'updated' | 'name' | 'downloads';

export interface Server {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  version: string | null;
  category: Category | null;
  source: 'registry' | 'community';

  // Package info
  package_name: string | null;
  package_type: PackageType | null;
  package_url: string | null;

  // Capabilities
  has_tools: boolean;
  has_resources: boolean;
  has_prompts: boolean;
  tool_count: number;

  // GitHub enrichment
  github_url: string | null;
  github_stars: number;
  github_forks: number;
  github_open_issues: number;
  github_last_push: string | null;
  github_license: string | null;
  github_language: string | null;
  github_contributors: number;
  github_archived: boolean;
  readme_content: string | null;

  // npm enrichment
  npm_weekly_downloads: number;

  // Registry metadata
  registry_status: 'active' | 'deprecated';
  registry_published_at: string | null;
  registry_updated_at: string | null;
  registry_tags: string[];

  // Our metadata
  is_official: boolean;
  featured: boolean;

  // Timestamps
  created_at: string;
  updated_at: string;
  last_synced_at: string;
}

export interface ServerTool {
  id: number;
  server_id: string;
  tool_name: string;
  tool_description: string | null;
  input_schema: Record<string, unknown> | null;
  created_at: string;
}

export type ServerListItem = Omit<Server, 'readme_content'>;

export interface ServerWithTools extends Server {
  tools: ServerTool[];
}

export interface SyncLog {
  id: number;
  started_at: string;
  completed_at: string | null;
  servers_synced: number;
  servers_enriched: number;
  errors: string[];
  status: 'running' | 'completed' | 'failed';
}

export interface ServerListParams {
  q?: string;
  category?: Category;
  packageTypes?: PackageType[];
  languages?: string[];
  hasTools?: boolean;
  hasResources?: boolean;
  hasPrompts?: boolean;
  isOfficial?: boolean;
  featured?: boolean;
  sort?: SortOption;
  page?: number;
  limit?: number;
  status?: 'active' | 'deprecated';
}

export interface ServerListResponse {
  servers: ServerListItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ConfigOutput {
  client: ClientType;
  config: Record<string, unknown>;
  filePath: { macos: string; windows: string; linux: string };
  postInstall: string;
  placeholders: string[];
}
