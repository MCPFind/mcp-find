<!--
Adding an MCP server to the directory? Fill in the checklist below.
Doing something else (a bug fix, docs, site work)? Delete the whole template
and just describe your change.
-->

## Adding a server

**Server name:**

**File you edited** — one of these two, nothing else:

- [ ] `submissions/<your-server>.yml` — a new file, one server per file. This is what the [submit form](https://mcpfind.org/submit) creates for you.
- [ ] `community-servers.yml` — a new entry appended to the existing `servers:` array.

> Any other path (for example `servers/`, `data/`, or the repo root) will not be
> picked up by validation and cannot be merged.

## Entry checklist

- [ ] The file has a top-level `servers:` array and my entry sits under it
- [ ] `name` — human-readable display name
- [ ] `github_url` — a plain `https://github.com/owner/repo` URL, no `/tree/...` or `/blob/...` suffix
- [ ] `package_name` — the exact npm package, PyPI project, or Docker image name
- [ ] `description` — at least 20 characters, one sentence, describes what the server does
- [ ] `package_type` — optional, one of `npm`, `pypi`, `docker`
- [ ] `category` — optional, but if present it is **exactly** one of the values in the list below

## Eligibility

- [ ] The repository is public and open source with a recognized license
- [ ] The README explains what the server does and how to install it
- [ ] The server exposes at least one MCP tool
- [ ] The package is actually published to npm or PyPI, or available as a Docker image
- [ ] This is not a fork without meaningful changes, and not a duplicate of an existing entry

## Valid `category` values

Exactly one of these. Anything else fails validation.

```
databases      cloud          monitoring     security       testing
analytics      automation     media          documentation  social
ecommerce      devtools       communication  filesystems    search
ai-ml          finance        productivity   other
```

Frequently rejected near-misses:

| You wrote | Use instead |
|-----------|-------------|
| `developer-tools`, `dev-tools`, `tools` | `devtools` |
| `ai`, `ml`, `llm` | `ai-ml` |
| `database`, `sql` | `databases` |
| `storage`, `files` | `filesystems` |
| `crm`, `sales` | `productivity` or `other` |
| `maps`, `location` | `other` |

## Example

```yaml
servers:
  - name: "GitHub MCP Server"
    github_url: "https://github.com/modelcontextprotocol/servers"
    package_name: "@modelcontextprotocol/server-github"
    description: "Interact with GitHub repositories, issues, and pull requests via MCP."
    package_type: "npm"
    category: "devtools"
```

## What happens next

Two checks run automatically. **Their results go to the job summary on this PR's
Checks tab** — click into a failing check to read exactly what needs fixing.
Fork PRs get a read-only token, so the checks report there rather than by
commenting on the PR.

See [CONTRIBUTING.md](../blob/main/CONTRIBUTING.md) for the full guide.
