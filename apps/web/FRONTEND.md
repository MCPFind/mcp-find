# MCP Find — Frontend Integration Guide

This is the primary reference document for Adam's agents building the UI layer.
Read this before writing any component or page code.

---

## 1. Project Overview

**MCP Find** is an open-source directory of Model Context Protocol (MCP) servers.
The goal is to make it trivially easy for developers to discover, evaluate, and
install MCP servers into their AI clients (Claude Desktop, Cursor, VS Code,
Windsurf, Claude Code).

**Stack:**
- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript (strict mode — `noUncheckedIndexedAccess` enabled)
- **Styling:** Tailwind CSS v3
- **Database:** Supabase (PostgreSQL)
- **Monorepo:** pnpm workspaces + Turborepo
- **Deployment:** Vercel

**Architecture:**
```
mcp-find/
  apps/
    web/              ← Next.js frontend (this package)
      app/            ← App Router pages
      components/     ← Shared React components
      lib/            ← Server-side utilities (queries, metadata)
  packages/
    shared/           ← TypeScript types, constants, config generator (shared npm package)
    mcp-server/       ← MCP protocol server (separate concern)
```

The `@mcpfind/shared` package is the contract between backend and frontend.
Never duplicate type definitions — always import from `@mcpfind/shared`.

---

## 2. Getting Started

### Prerequisites
- Node.js 20+
- pnpm 9+

### Setup

```bash
# Clone
git clone https://github.com/gusmar2017/mcp-find.git
cd mcp-find

# Install dependencies (all workspaces)
pnpm install

# Build shared package first
pnpm --filter @mcpfind/shared build

# Start web dev server
pnpm --filter @mcpfind/web dev
```

### Environment Variables

Create `apps/web/.env.local`:

```env
# Required — Supabase connection
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=<anon-key>
```

Both variables are server-only (no `NEXT_PUBLIC_` prefix). They are never
exposed to the browser. The Supabase client is lazy-initialized in
`lib/supabase.ts` — it throws at runtime if missing.

### Type checking

```bash
pnpm --filter @mcpfind/web type-check
```

### Build

```bash
pnpm build   # builds all packages via Turborepo
```

---

## 3. TypeScript Types

All types are in `packages/shared/src/types.ts` and exported from `@mcpfind/shared`.

### Core Types

#### `Server`
The primary database entity. All fields mirror the `servers` Supabase table.

```ts
interface Server {
  id: string;               // UUID primary key
  slug: string;             // URL-safe identifier, e.g. "postgres-mcp"
  name: string;             // Human-readable name
  description: string | null;
  version: string | null;   // Latest published version
  category: Category | null; // One of 11 category values (see below)
  source: 'registry' | 'community'; // Data origin

  // Package info — how to install
  package_name: string | null;  // e.g. "@modelcontextprotocol/server-postgres"
  package_type: PackageType | null; // 'npm' | 'pypi' | 'docker' | 'other'
  package_url: string | null;   // Link to npm/PyPI/Docker Hub page

  // Capability flags (denormalized for fast filtering)
  has_tools: boolean;
  has_resources: boolean;
  has_prompts: boolean;
  tool_count: number;

  // GitHub enrichment (populated by sync pipeline)
  github_url: string | null;
  github_stars: number;         // defaults to 0 if not enriched
  github_forks: number;
  github_open_issues: number;
  github_last_push: string | null;  // ISO 8601 datetime
  github_license: string | null;    // SPDX identifier, e.g. "MIT"
  github_language: string | null;   // Primary language
  github_contributors: number;
  github_archived: boolean;         // true if repo is archived
  readme_content: string | null;    // Raw README markdown (may be long)

  // npm enrichment
  npm_weekly_downloads: number; // defaults to 0

  // Registry metadata
  registry_status: 'active' | 'deprecated';
  registry_published_at: string | null;
  registry_updated_at: string | null;
  registry_tags: string[];

  // Our metadata
  is_official: boolean; // true if scope is @modelcontextprotocol/ or @anthropic/
  featured: boolean;

  // Timestamps
  created_at: string;  // ISO 8601
  updated_at: string;  // ISO 8601
  last_synced_at: string; // ISO 8601
}
```

#### `ServerWithTools`
`Server` extended with tool definitions. Used on the detail page.

```ts
interface ServerWithTools extends Server {
  tools: ServerTool[];
}
```

#### `ServerTool`
Individual tool exposed by an MCP server.

```ts
interface ServerTool {
  id: number;
  server_id: string;
  tool_name: string;                           // e.g. "query_database"
  tool_description: string | null;
  input_schema: Record<string, unknown> | null; // JSON Schema object
  created_at: string;
}
```

#### `ServerListParams`
Input to `listServers()`.

```ts
interface ServerListParams {
  q?: string;                                       // Full-text search query
  category?: Category;                              // Filter by category
  sort?: 'stars' | 'updated' | 'name' | 'downloads'; // Default: 'stars'
  page?: number;                                    // Default: 1
  limit?: number;                                   // Default: 24, max: 100
  status?: 'active' | 'deprecated';                // Default: 'active'
}
```

#### `ServerListResponse`
Output from `listServers()`.

```ts
interface ServerListResponse {
  servers: Server[];
  total: number;       // Total matching results (for pagination)
  page: number;        // Current page
  limit: number;       // Page size used
  totalPages: number;  // Math.ceil(total / limit)
}
```

#### `PackageType`
```ts
type PackageType = 'npm' | 'pypi' | 'docker' | 'other';
```

#### `ClientType`
```ts
type ClientType = 'claude-desktop' | 'cursor' | 'vscode' | 'windsurf' | 'claude-code';
```

#### `ConfigOutput`
Output from `generateConfig()`. Used by the `ConfigSnippet` component.

```ts
interface ConfigOutput {
  client: ClientType;
  config: Record<string, unknown>;  // The JSON to paste into the config file
  filePath: {
    macos: string;
    windows: string;
    linux: string;
  };
  postInstall: string;    // Instructions to restart the client
  placeholders: string[]; // Required env var names the user must fill in
}
```

### Category Types

```ts
const CATEGORIES = [
  'databases', 'cloud', 'devtools', 'communication',
  'filesystems', 'search', 'ai-ml', 'finance', 'crm',
  'productivity', 'other',
] as const;

type Category = typeof CATEGORIES[number];

const CATEGORY_LABELS: Record<Category, string> = {
  databases: 'Databases',
  cloud: 'Cloud Providers',
  devtools: 'Developer Tools',
  communication: 'Communication',
  filesystems: 'File Systems',
  search: 'Search & Knowledge',
  'ai-ml': 'AI & ML',
  finance: 'Finance',
  crm: 'CRM',
  productivity: 'Productivity',
  other: 'Other',
};
```

---

## 4. API Contract

### Data Layer (Server Components only)

All data fetching goes through `lib/queries.ts`. These functions call Supabase
directly from Server Components — there is no intermediate API layer for SSR pages.

#### `listServers(params: ServerListParams): Promise<ServerListResponse>`
Full-text search + filter + paginate the servers table.

```ts
// Example: search for "postgres", filter to databases, sort by stars, page 2
const result = await listServers({
  q: 'postgres',
  category: 'databases',
  sort: 'stars',
  page: 2,
});
// result.servers — array of Server objects
// result.total — total matching records
// result.totalPages — number of pages
```

#### `getServerBySlug(slug: string): Promise<ServerWithTools | null>`
Fetch a single server plus all its tools. Returns `null` if not found.

```ts
const server = await getServerBySlug('postgres-mcp');
if (!server) notFound();
// server.tools — ServerTool[]
```

#### `getTopServers(limit: number): Promise<Server[]>`
Ordered by `github_stars` desc. Used for `generateStaticParams`.

```ts
const top200 = await getTopServers(200);
```

#### `getServersByCategory(category: string): Promise<Server[]>`
All active servers in a category, ordered by stars, limit 200.

```ts
const dbServers = await getServersByCategory('databases');
```

#### `getServerCount(): Promise<number>`
Total count of active servers. Used on the home page.

#### `getLastSyncTime(): Promise<string | null>`
ISO timestamp of the last successful data sync.

### REST API Routes (for client-side use)

Located under `app/api/`. Available endpoints:

#### `GET /api/servers`
Query params: `q`, `category`, `sort`, `page`, `limit`

```
GET /api/servers?q=postgres&category=databases&sort=stars&page=1
```

Response: `ServerListResponse` JSON

#### `GET /api/servers/health`
Health check. Returns `{ status: 'ok', timestamp: '...' }`.

---

## 5. Data Fetching Patterns

### Pattern 1: Server Component with direct DB call (preferred)

```tsx
// app/servers/page.tsx
export default async function ServersPage() {
  const result = await listServers({ sort: 'stars', page: 1 });
  return <ServerList result={result} />;
}
```

No `useEffect`, no `fetch('/api/...')`, no loading states needed. The page
is rendered on the server with real data. This is the SSR-first approach.

### Pattern 2: ISR for detail pages

```tsx
// app/servers/[slug]/page.tsx
export const revalidate = 86400; // Re-render in background after 24h

export async function generateStaticParams() {
  const top = await getTopServers(200);
  return top.map((s) => ({ slug: s.slug }));
}
```

Top 200 servers are pre-built at deploy time. All others are rendered on first
request and cached for 24 hours (ISR).

### Pattern 3: Client-side for interactive UI

```tsx
// components/SearchBar.tsx
"use client";
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

// Update URL params → Next.js re-renders the Server Component with new params
function onSearch(value: string) {
  const params = new URLSearchParams(searchParams.toString());
  params.set('q', value);
  router.push(`${pathname}?${params.toString()}`);
}
```

Client components update URL params, which triggers Server Component re-renders
with fresh data. The client never fetches data directly — it just navigates.

### Pattern 4: Fetch deduplication

If multiple Server Components need the same data in one render, wrap the query
in React's `cache()`:

```ts
import { cache } from 'react';

export const getServerBySlug = cache(async (slug: string) => {
  // Called once even if multiple components request the same slug
});
```

---

## 6. Page Structure

### App Router File Tree

```
apps/web/app/
  layout.tsx                    ← Root layout (html, body, global nav)
  globals.css                   ← Tailwind base styles
  page.tsx                      ← Home page (/)
  sitemap.xml                   ← Static sitemap (update to dynamic)
  llms.txt                      ← AI discoverability
  llms-full.txt                 ← AI discoverability (full)

  servers/
    page.tsx                    ← /servers — browse/search
    [slug]/
      page.tsx                  ← /servers/:slug — detail

  categories/
    [category]/
      page.tsx                  ← /categories/:category

  submit/
    page.tsx                    ← /submit — placeholder

  api/
    servers/
      route.ts                  ← GET /api/servers
      health/
        route.ts                ← GET /api/servers/health
```

### Route Behaviors

| Route | Rendering | Revalidation | Static Params |
|-------|-----------|--------------|---------------|
| `/` | SSR | on-demand | — |
| `/servers` | SSR (dynamic, searchParams) | per request | — |
| `/servers/[slug]` | ISR | 24h | top 200 by stars |
| `/categories/[category]` | SSG | at build | all 11 categories |
| `/submit` | Static | never | — |

---

## 7. Component List

See `components/README.md` for full props interfaces. Summary:

| Component | Type | File | Purpose |
|-----------|------|------|---------|
| `ServerCard` | Server | `components/ServerCard.tsx` | Card for listing pages |
| `ServerDetail` | Server | `components/ServerDetail.tsx` | Full detail layout |
| `ConfigSnippet` | **Client** | `components/ConfigSnippet.tsx` | 5-tab install config |
| `SearchBar` | **Client** | `components/SearchBar.tsx` | Debounced search input |
| `TrustSignals` | Server | `components/TrustSignals.tsx` | Color-coded health badges |
| `ToolSchema` | Server | `components/ToolSchema.tsx` | Tool list with schemas |
| `CategoryFilter` | **Client** | `components/CategoryFilter.tsx` | Sidebar category filter |
| `CopyButton` | **Client** | `components/CopyButton.tsx` | Clipboard copy with feedback |
| `Pagination` | **Client** | `components/Pagination.tsx` | Page navigation |

---

## 8. ConfigSnippet Component — Detailed Spec

This is the most complex UI component. It generates install configs for 5
different MCP clients.

### Data Flow

```
Server (page.tsx)
  └── passes: slug, packageName, packageType to ConfigSnippet

ConfigSnippet (client component)
  └── for selected tab (ClientType):
      └── calls generateConfig({ slug, packageName, packageType }, client)
      └── receives ConfigOutput { config, filePath, postInstall, placeholders }
      └── renders: JSON code block + copy button + file path + post-install note
```

### Using `generateConfig`

```ts
import { generateConfig } from '@mcpfind/shared';

const output = generateConfig(
  {
    slug: 'postgres-mcp',
    packageName: '@modelcontextprotocol/server-postgres',
    packageType: 'npm',
    // optional:
    envVars: [{ name: 'DATABASE_URL', placeholder: 'YOUR_DATABASE_URL', required: true }],
  },
  'claude-desktop'  // ClientType
);

// output.config — the JSON object to display
// output.filePath.macos — path to paste it into
// output.postInstall — "Restart Claude Desktop completely..."
// output.placeholders — ['DATABASE_URL'] if required vars present
```

### Tab Order

Always render tabs in this order:
1. Claude Desktop (`claude-desktop`)
2. Cursor (`cursor`)
3. VS Code (`vscode`)
4. Windsurf (`windsurf`)
5. Claude Code (`claude-code`)

### Config JSON Display

```tsx
<pre className="bg-gray-900 text-gray-100 p-4 rounded-lg overflow-auto text-sm font-mono">
  {JSON.stringify(output.config, null, 2)}
</pre>
```

### Placeholder Warning

If `output.placeholders.length > 0`, render before the code block:
```tsx
<div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-3 text-sm">
  <strong>Required:</strong> Replace {output.placeholders.join(', ')} with your values.
</div>
```

### Where to Get `packageName` and `packageType`

The calling page (`app/servers/[slug]/page.tsx`) passes these from the `Server`
object:
```tsx
<ConfigSnippet
  slug={server.slug}
  packageName={server.package_name ?? server.slug}
  packageType={server.package_type ?? 'npm'}
/>
```

---

## 9. Design Requirements

### SSR-First Rule

All discoverable content (server names, descriptions, categories, stats) MUST
be server-rendered. Never fetch this data client-side only. Search engines and
AI crawlers index the server-rendered HTML — client-only content is invisible.

### Responsive Breakpoints (Tailwind)

```
Mobile:   default (no prefix) — single column
Tablet:   md: (768px+) — two columns
Desktop:  lg: (1024px+) — three columns / sidebar layout
```

### Trust Signal Color System

| Status | Background | Text | Usage |
|--------|-----------|------|-------|
| Green  | `bg-green-100` | `text-green-800` | Fresh (< 30d), licensed, official |
| Yellow | `bg-yellow-100` | `text-yellow-800` | Stale (30–180d) |
| Red    | `bg-red-100` | `text-red-800` | Dead (> 180d), archived, deprecated |
| Gray   | `bg-gray-100` | `text-gray-600` | Neutral info |

### Typography

- Headings: `font-bold` with standard Tailwind size scale (text-3xl → text-xl → text-lg)
- Code/mono: `font-mono` for tool names, package names, config JSON
- Body: `text-gray-600` for secondary text, `text-gray-500` for metadata
- Links: `text-blue-600 hover:underline`

### Page Layout Pattern

```
<main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
  {/* content */}
</main>
```

Always use a max-width container with horizontal padding.

### Accessibility

- All interactive elements need `aria-label` where label text is not visible
- Use semantic HTML: `<nav>`, `<main>`, `<section>`, `<article>`, `<aside>`
- `<h1>` must appear exactly once per page
- Images need `alt` text (use `next/image`)
- Tab indices should follow natural DOM order

---

## 10. What NOT to Do

### Never do client-side-only data fetching for discoverable content

```tsx
// BAD — Google can't index this
"use client";
const [servers, setServers] = useState([]);
useEffect(() => {
  fetch('/api/servers').then(r => r.json()).then(setServers);
}, []);

// GOOD — server-rendered, indexable
export default async function Page() {
  const result = await listServers({ sort: 'stars' });
  return <ServerList servers={result.servers} />;
}
```

### Never put `"use client"` on pages

Pages are Server Components by default. Only mark a component `"use client"` if
it genuinely needs browser APIs (`useState`, `useEffect`, event handlers, etc.).

### Never import server-only code into client components

`lib/queries.ts` and `lib/supabase.ts` are server-only. Do not import them from
any `"use client"` component. The Next.js build will fail if you try.

### Never duplicate types from `@mcpfind/shared`

Every type already exists. Import, do not redefine.

### Never hardcode client config paths or install commands

Always use `generateConfig()` from `@mcpfind/shared`. The config generator is
the single source of truth for all client configs.

### Never use `any` type

TypeScript strict mode is enforced. Use `unknown` + type guards, or import the
correct type from `@mcpfind/shared`.

### Never skip ISR revalidation on detail pages

The `export const revalidate = 86400;` on `app/servers/[slug]/page.tsx` is
intentional. GitHub data changes slowly — 24h cache is appropriate.

---

## 11. Shared Constants Reference

From `@mcpfind/shared`:

```ts
SITE_NAME = 'MCP Find'
SITE_URL = 'https://mcpfind.org'
SITE_DESCRIPTION = 'The open-source way to find MCP servers. AI-agent optimized.'

DEFAULT_PAGE_SIZE = 24
MAX_PAGE_SIZE = 100

OFFICIAL_SCOPES = ['@modelcontextprotocol/', '@anthropic/']

CLIENT_CONFIGS  // Record<ClientType, { topLevelKey, filePath, postInstall }>
CATEGORIES      // readonly array of 11 category slugs
CATEGORY_LABELS // Record<Category, string> human labels
```

---

## 12. Metadata & SEO

### Per-Page Metadata

Each page exports a `metadata` object or `generateMetadata` function:

```ts
// Static metadata
export const metadata: Metadata = {
  title: 'Browse MCP Servers | MCP Find',
  description: '...',
};

// Dynamic metadata (detail pages)
export async function generateMetadata({ params }): Promise<Metadata> {
  const server = await getServerBySlug((await params).slug);
  return generateServerMetadata(server); // from lib/metadata.ts
}
```

### JSON-LD Structured Data

Both the server detail page and category page inject JSON-LD via:

```tsx
<script
  type="application/ld+json"
  dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
/>
```

Helper functions are in `lib/metadata.ts`:
- `generateServerJsonLd(server)` — `SoftwareApplication` schema
- `generateCategoryJsonLd(category, label, servers)` — `CollectionPage` schema

---

## 13. Summary Checklist for New Components

Before submitting a new component, verify:

- [ ] Server Component by default — only `"use client"` if truly needed
- [ ] TypeScript strict — no `any`, all props typed with interfaces
- [ ] Imports types from `@mcpfind/shared` — not redefined locally
- [ ] Responsive — works at mobile, tablet, desktop breakpoints
- [ ] Accessible — semantic HTML, aria-labels, logical heading order
- [ ] SSR-safe — no `window`, `document`, `localStorage` at module level
- [ ] Trust signal colors follow the green/yellow/red system
- [ ] `generateConfig()` used for all config JSON (not hardcoded)
