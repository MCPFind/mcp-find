-- MCP Find — Initial Schema
-- Tables: servers, server_tools, sync_log

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Servers table (primary)
CREATE TABLE servers (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  version TEXT,
  category TEXT,
  source TEXT NOT NULL DEFAULT 'registry',

  -- Package info
  package_name TEXT,
  package_type TEXT,
  package_url TEXT,

  -- Capabilities
  has_tools BOOLEAN DEFAULT FALSE,
  has_resources BOOLEAN DEFAULT FALSE,
  has_prompts BOOLEAN DEFAULT FALSE,
  tool_count INTEGER DEFAULT 0,

  -- GitHub enrichment
  github_url TEXT,
  github_stars INTEGER DEFAULT 0,
  github_forks INTEGER DEFAULT 0,
  github_open_issues INTEGER DEFAULT 0,
  github_last_push TIMESTAMPTZ,
  github_license TEXT,
  github_language TEXT,
  github_contributors INTEGER DEFAULT 0,
  github_archived BOOLEAN DEFAULT FALSE,
  readme_content TEXT,

  -- npm enrichment
  npm_weekly_downloads INTEGER DEFAULT 0,

  -- Registry metadata
  registry_status TEXT DEFAULT 'active',
  registry_published_at TIMESTAMPTZ,
  registry_updated_at TIMESTAMPTZ,
  registry_tags TEXT[],

  -- Our metadata
  is_official BOOLEAN DEFAULT FALSE,
  featured BOOLEAN DEFAULT FALSE,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- Full-text search vector (trigger-maintained — array_to_string is not immutable)
ALTER TABLE servers ADD COLUMN search_vector tsvector;

CREATE OR REPLACE FUNCTION servers_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('english', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(array_to_string(NEW.registry_tags, ' '), '')), 'B') ||
    setweight(to_tsvector('english', coalesce(NEW.category, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER servers_search_vector_trigger
  BEFORE INSERT OR UPDATE ON servers
  FOR EACH ROW EXECUTE FUNCTION servers_search_vector_update();

-- Indexes
CREATE INDEX idx_servers_category ON servers(category);
CREATE INDEX idx_servers_github_stars ON servers(github_stars DESC);
CREATE INDEX idx_servers_source ON servers(source);
CREATE INDEX idx_servers_registry_status ON servers(registry_status);
CREATE INDEX idx_servers_search ON servers USING GIN(search_vector);
CREATE INDEX idx_servers_name_trgm ON servers USING GIN(name gin_trgm_ops);
CREATE INDEX idx_servers_description_trgm ON servers USING GIN(description gin_trgm_ops);

-- Server tools table
CREATE TABLE server_tools (
  id SERIAL PRIMARY KEY,
  server_id TEXT REFERENCES servers(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  tool_description TEXT,
  input_schema JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_server_tools_server_id ON server_tools(server_id);

-- Sync log table
CREATE TABLE sync_log (
  id SERIAL PRIMARY KEY,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  servers_synced INTEGER DEFAULT 0,
  servers_enriched INTEGER DEFAULT 0,
  errors TEXT[],
  status TEXT DEFAULT 'running'
);

-- Row Level Security
ALTER TABLE servers ENABLE ROW LEVEL SECURITY;
ALTER TABLE server_tools ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;
-- No public read policy — sync_log is service-role only

CREATE POLICY "Public read servers" ON servers FOR SELECT USING (true);
CREATE POLICY "Public read tools" ON server_tools FOR SELECT USING (true);

-- Fix 6: CHECK constraints for enum-like columns
ALTER TABLE servers ADD CONSTRAINT chk_source CHECK (source IN ('registry', 'community'));
ALTER TABLE servers ADD CONSTRAINT chk_registry_status CHECK (registry_status IN ('active', 'deprecated'));
ALTER TABLE servers ADD CONSTRAINT chk_package_type CHECK (package_type IS NULL OR package_type IN ('npm', 'pypi', 'docker', 'other'));

-- Fix 7: Unique constraint on server_tools
ALTER TABLE server_tools ADD CONSTRAINT uq_server_tools UNIQUE (server_id, tool_name);
