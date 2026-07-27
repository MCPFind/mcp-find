import type { Category } from './categories';

export type { Category };

export type PackageType = 'npm' | 'pypi' | 'docker' | 'other';

/**
 * Closed enum for directory entry quality status.
 * Populated from the v1 audit manifest (directory-quality-audit-2026-05-20.json)
 * and will be superseded by v2 manifest after Phase 2 enrichment.
 * Unknown values fail the build — see scripts/check-broken-delta.mjs and lib/quality-status.ts.
 *
 * SINGLE SOURCE OF TRUTH: derive QualityStatus from this constant.
 * scripts/check-broken-delta.mjs has a local VALID_STATUSES set that must stay in
 * sync — see comment there. Future: import this constant once the script can resolve TS.
 */
export const QUALITY_STATUS_VALUES = ['HEALTHY', 'STALE', 'BROKEN', 'LOW-CREDIBILITY'] as const;
export type QualityStatus = typeof QUALITY_STATUS_VALUES[number];

export type ClientType = 'claude-desktop' | 'cursor' | 'vscode' | 'windsurf' | 'claude-code';

export type SortOption = 'stars' | 'updated' | 'name' | 'downloads';

export interface Server {
  id: string;
  slug: string;
  // Stable URL slug — set once on INSERT, never overwritten on subsequent syncs.
  // Populated after migration 005_canonical_slug.sql runs; null until then (use slug as fallback).
  canonical_slug: string | null;
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
