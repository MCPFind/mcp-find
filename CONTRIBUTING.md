# Contributing to MCP Find

Thank you for helping grow the MCP server directory. This guide explains how to submit a community server.

## What We Accept

To be listed, your MCP server must meet all of the following requirements:

- **Public repository** — hosted on GitHub with a public URL
- **Open source license** — must include a recognized OSS license (MIT, Apache 2.0, GPL, etc.)
- **README** — must describe what the server does and how to install/configure it
- **At least one MCP tool** — the project must expose at least one callable MCP tool
- **Published package** — must be published to npm, PyPI, or available as a Docker image

## What We Do NOT Accept

- Forks without meaningful changes from the upstream project
- Abandoned projects — repositories with no commits in the last 12 months
- Servers with no source code (binary-only or closed-source distributions)
- Duplicate submissions for the same package

## How to Submit

There are two accepted routes. Both are validated by the same CI checks — pick whichever
is easier for you.

### Route A — the submit form (recommended, no local Git)

1. Go to [mcpfind.org/submit](https://mcpfind.org/submit) and fill in your server details
2. Click **Open GitHub Editor**. GitHub opens a prefilled new file at
   `submissions/<your-server>.yml` and walks you through forking and opening a PR
3. Title the pull request `Add: <your-server-name>`

The form uses a per-server file because GitHub's prefill flow can only create a *new*
file — it cannot append an entry to `community-servers.yml`. See
[`submissions/README.md`](submissions/README.md).

### Route B — edit the registry file by hand

1. Fork this repository
2. Edit `community-servers.yml` and add your server entry under the `servers` array
3. Fill in all required fields (see schema below)
4. Open a pull request — the title should be `Add: <your-server-name>`

### What happens next

Automated validation runs within a few minutes. Results are written to the **job summary**
on your PR's Checks tab — open the failing check to read exactly what needs fixing. A
maintainer reviews and merges once the checks are green.

## YAML Schema

```yaml
servers:
  - name: "My MCP Server"           # required — human-readable display name
    github_url: "https://github.com/owner/repo"  # required — must start with https://github.com/
    package_name: "my-mcp-server"   # required — npm package name, PyPI name, or Docker image
    description: "One-sentence description of what this server does."  # required
    package_type: "npm"             # optional — npm | pypi | docker (defaults to npm)
    category: "devtools"            # optional — see valid categories below
```

### Valid Categories

`category` is optional, but if present it must be exactly one of the values below. These
are the canonical values from the schema (`packages/shared/src/categories.ts`) — anything
else is rejected by validation.

| Category | Use for |
|----------|---------|
| `databases` | Database connectors, query engines, ORMs |
| `cloud` | AWS, GCP, Azure, cloud provider integrations |
| `monitoring` | Observability, metrics, logging, alerting |
| `security` | Auth, secrets, scanning, compliance |
| `testing` | Test runners, fixtures, QA tooling |
| `analytics` | BI, dashboards, product analytics |
| `automation` | Workflow automation, schedulers, RPA |
| `media` | Images, audio, video, generation and processing |
| `documentation` | Docs sites, knowledge bases, references |
| `social` | Social platforms and feeds |
| `ecommerce` | Storefronts, catalogs, payments, fulfillment |
| `devtools` | Developer tools, IDEs, code execution |
| `communication` | Slack, email, messaging platforms |
| `filesystems` | File access, cloud storage, document management |
| `search` | Web search, vector search, knowledge retrieval |
| `ai-ml` | AI/ML model APIs, embedding services, inference |
| `finance` | Financial data, trading, payment systems |
| `productivity` | Calendars, task managers, note-taking |
| `other` | Anything that doesn't fit the above |

Two values you may see on older directory entries — `crm` and `maps` — are legacy and are
**not** accepted on new submissions. Use `productivity` or `other` instead.

Common near-misses that will be rejected: `developer-tools` (use `devtools`),
`ai`/`ml`/`llm` (use `ai-ml`), `database` (use `databases`), `storage` (use `filesystems`).

### Example Entry

```yaml
servers:
  - name: "GitHub MCP Server"
    github_url: "https://github.com/modelcontextprotocol/servers"
    package_name: "@modelcontextprotocol/server-github"
    description: "Interact with GitHub repositories, issues, and pull requests via MCP."
    package_type: "npm"
    category: "devtools"
```

## Automated Validation

When you open a PR that adds a file under `submissions/` or modifies
`community-servers.yml`, two GitHub Actions checks run automatically:

- **Validate Community Submission** — structural checks: required fields present, URL
  shape, description length, valid `package_type` and `category`.
- **Verify Submission Liveness** — the repo is public, an OSS license is present, and the
  declared package actually exists on npm/PyPI.

Results are written to the **job summary** on the PR's Checks tab. Open the check run to
read the itemized pass/fail list. A green check means the submission is ready for
maintainer review; a red check lists exactly what to fix. Push corrections and the checks
re-run.

Common validation errors:
- Missing required fields (`name`, `github_url`, `package_name`, `description`)
- `github_url` is not a plain `https://github.com/owner/repo` URL
- Invalid `package_type` — must be `npm`, `pypi`, or `docker`
- Invalid `category` — must be one of the values listed above
- `description` must be at least 20 characters

## Review Timeline

We aim to review passing submissions within **48 hours**. If your PR has been open longer than that with no activity, feel free to leave a comment to ping the maintainers.
