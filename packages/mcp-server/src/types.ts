export const CATEGORIES = [
  'databases',
  'cloud',
  'monitoring',
  'security',
  'testing',
  'analytics',
  'automation',
  'media',
  'documentation',
  'social',
  'ecommerce',
  'devtools',
  'communication',
  'filesystems',
  'search',
  'ai-ml',
  'finance',
  'productivity',
  'other',
] as const;

export type Category = typeof CATEGORIES[number];
export type ClientType = 'claude-desktop' | 'cursor' | 'vscode' | 'windsurf' | 'claude-code';
export type SortOption = 'stars' | 'updated' | 'name' | 'downloads';

export interface ServerListItem {
  name: string;
  slug: string;
  description: string | null;
  category: Category | null;
  github_stars: number;
  github_license: string | null;
  package_type: string | null;
  is_official: boolean;
}

export interface ServerTool {
  tool_name: string;
  tool_description: string | null;
  input_schema: Record<string, unknown> | null;
}

export interface ServerWithTools extends ServerListItem {
  version: string | null;
  package_name: string | null;
  github_url: string | null;
  github_last_push: string | null;
  tools: ServerTool[];
  readme_content: string | null;
}

export interface ServerListResponse {
  servers: ServerListItem[];
}

export type ConfigOutput = Record<string, unknown>;
