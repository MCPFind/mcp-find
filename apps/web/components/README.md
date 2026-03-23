# MCP Find — Component Interfaces

All components live under `apps/web/components/`. This document is the contract
Adam's agents must follow when implementing each component. Do not change the
props interfaces — they are what the stub pages already depend on.

---

## 1. ServerCard

**Type:** Server Component (no `"use client"`)
**File:** `components/ServerCard.tsx`

```tsx
import type { Server } from '@mcpfind/shared';

interface ServerCardProps {
  server: Server;
}

export default function ServerCard({ server }: ServerCardProps) { ... }
```

**Renders:**
- `server.name` as a link to `/servers/${server.slug}`
- `server.description` truncated to 2 lines (`line-clamp-2`)
- Category badge — pill shape, color-coded per category (see design guide)
- Star count with star icon: `server.github_stars`
- Last commit relative time (e.g., "3 days ago") derived from `server.github_last_push`
- License badge: `server.github_license` (gray pill if present, nothing if null)
- Package type icon: `server.package_type` — npm (N), pypi (snake), docker (whale), other (box)
- `server.is_official` — show a verified badge if true

**Design requirements:**
- Card: white background, 1px border, rounded-lg, hover shadow
- Responsive grid parent: 1 col mobile, 2 col tablet (`md:`), 3 col desktop (`lg:`)
- All content must be server-rendered (no `useEffect` for data)

---

## 2. ServerDetail

**Type:** Server Component
**File:** `components/ServerDetail.tsx`

```tsx
import type { ServerWithTools } from '@mcpfind/shared';

interface ServerDetailProps {
  server: ServerWithTools;
}

export default function ServerDetail({ server }: ServerDetailProps) { ... }
```

**Renders:**
- Full header: name (h1), description, trust signals row
- Install section: `<ConfigSnippet>` (client component — compose it here)
- Tools section: `<ToolSchema tools={server.tools} />` — only render if `server.tools.length > 0`
- README section: rendered markdown — use a markdown library (e.g., `react-markdown`)
- Sidebar (desktop only): GitHub stats, npm downloads, package info, links

**Layout:**
- Two-column at `lg:` — main content left (2/3), sidebar right (1/3)
- Single column on mobile

---

## 3. ConfigSnippet

**Type:** Client Component
**File:** `components/ConfigSnippet.tsx`
**Directive:** `"use client"`

```tsx
import type { PackageType } from '@mcpfind/shared';

interface ConfigSnippetProps {
  slug: string;
  packageName: string;
  packageType: PackageType;
}

export default function ConfigSnippet({
  slug,
  packageName,
  packageType,
}: ConfigSnippetProps) { ... }
```

**Behavior:**
- Five tabs: Claude Desktop | Cursor | VS Code | Windsurf | Claude Code
- Use `generateConfig(input, client)` from `@mcpfind/shared` to produce the config JSON
- Display config as a `<pre>` block with syntax-highlighted JSON
- `<CopyButton>` in top-right corner of the code block
- Below the code: show the OS-specific file path (use `filePath.macos` by default; add OS selector if desired)
- Below the file path: show `postInstall` message in a callout box
- If `placeholders.length > 0`: show a warning banner listing required env vars before the code block

**Tab state:** stored in `useState`; default tab is `claude-desktop`

**Import:**
```ts
import { generateConfig } from '@mcpfind/shared';
```

---

## 4. SearchBar

**Type:** Client Component
**File:** `components/SearchBar.tsx`
**Directive:** `"use client"`

```tsx
interface SearchBarProps {
  defaultValue?: string;
}

export default function SearchBar({ defaultValue }: SearchBarProps) { ... }
```

**Behavior:**
- Reads initial value from `defaultValue` (passed from `searchParams.q` in the page)
- Debounces input changes: 300ms
- On change: updates URL query param `?q=<value>` using `useRouter` + `usePathname`
- Clears `?page` param when query changes (reset to page 1)
- Shows a clear (×) button when the field has a value
- Accessible: `<input type="search">`, `aria-label="Search MCP servers"`

---

## 5. TrustSignals

**Type:** Server Component
**File:** `components/TrustSignals.tsx`

```tsx
import type { Server } from '@mcpfind/shared';

interface TrustSignalsProps {
  server: Server;
}

export default function TrustSignals({ server }: TrustSignalsProps) { ... }
```

**Renders** a horizontal row of colored badge/pill indicators:

| Signal | Green | Yellow | Red |
|--------|-------|--------|-----|
| Last commit | < 30 days ago | 30–180 days ago | > 180 days ago |
| License | Has license | — | No license |
| Archived | — | — | `github_archived === true` |
| Deprecated | — | — | `registry_status === 'deprecated'` |
| Official | `is_official === true` | — | — |

**Color classes (Tailwind):**
- Green: `bg-green-100 text-green-800`
- Yellow: `bg-yellow-100 text-yellow-800`
- Red: `bg-red-100 text-red-800`

**Date calculation:** derive from `server.github_last_push` (ISO string). Use vanilla JS
`Date` — no date library needed.

---

## 6. ToolSchema

**Type:** Server Component
**File:** `components/ToolSchema.tsx`

```tsx
import type { ServerTool } from '@mcpfind/shared';

interface ToolSchemaProps {
  tools: ServerTool[];
}

export default function ToolSchema({ tools }: ToolSchemaProps) { ... }
```

**Renders:**
- For each tool: `tool.tool_name` as monospace heading, `tool.tool_description` as body text
- If `tool.input_schema` is non-null: render it as a collapsible `<details>` block
  containing `<pre>{JSON.stringify(tool.input_schema, null, 2)}</pre>`
- Wrap entire section in a `<ul>` with each tool as a `<li>` for accessibility

---

## 7. CategoryFilter

**Type:** Client Component
**File:** `components/CategoryFilter.tsx`
**Directive:** `"use client"`

```tsx
interface CategoryFilterProps {
  activeCategory?: string;
}

export default function CategoryFilter({ activeCategory }: CategoryFilterProps) { ... }
```

**Behavior:**
- Renders a vertical list of all categories from `CATEGORIES` with labels from `CATEGORY_LABELS`
- Clicking a category updates URL param `?category=<cat>` (clears `?page`)
- Active category shown with filled background pill
- "All" option at top clears `?category`
- Uses `useRouter` + `usePathname` + `useSearchParams` for URL manipulation

**Import:**
```ts
import { CATEGORIES, CATEGORY_LABELS } from '@mcpfind/shared';
```

---

## 8. CopyButton

**Type:** Client Component
**File:** `components/CopyButton.tsx`
**Directive:** `"use client"`

```tsx
interface CopyButtonProps {
  text: string;
  label?: string; // defaults to "Copy"
}

export default function CopyButton({ text, label = 'Copy' }: CopyButtonProps) { ... }
```

**Behavior:**
- Calls `navigator.clipboard.writeText(text)` on click
- Shows "Copied!" for 2 seconds after successful copy, then reverts to `label`
- Shows "Failed" on error, reverts after 2 seconds
- Accessible: `aria-label` updates dynamically

---

## Component Dependency Graph

```
ServersPage
  └── ServerCard[]        (server component)
  └── SearchBar           (client — updates ?q)
  └── CategoryFilter      (client — updates ?category)
  └── Pagination          (client — updates ?page)

ServerDetailPage
  └── TrustSignals        (server)
  └── ConfigSnippet       (client)
      └── CopyButton      (client)
  └── ToolSchema          (server)
  └── README section      (server — react-markdown)

CategoryPage
  └── ServerCard[]        (server — reuse from /servers)
```
