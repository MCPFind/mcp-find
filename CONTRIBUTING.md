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

1. Fork this repository
2. Edit `community-servers.yml` and add your server entry under the `servers` array
3. Fill in all required fields (see schema below)
4. Open a pull request — the title should be `Add: <your-server-name>`
5. Automated validation will run within a few minutes and post a comment with results
6. A maintainer will review and merge once validation passes

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

| Category | Use for |
|----------|---------|
| `databases` | Database connectors, query engines, ORMs |
| `cloud` | AWS, GCP, Azure, cloud provider integrations |
| `devtools` | Developer tools, IDEs, code execution |
| `communication` | Slack, email, messaging platforms |
| `filesystems` | File access, cloud storage, document management |
| `search` | Web search, vector search, knowledge retrieval |
| `ai-ml` | AI/ML model APIs, embedding services, inference |
| `finance` | Financial data, trading, payment systems |
| `crm` | CRM platforms, sales tools, customer data |
| `productivity` | Calendars, task managers, note-taking |
| `other` | Anything that doesn't fit the above |

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

When you open a PR that modifies `community-servers.yml`, a GitHub Actions workflow runs automatically and posts a comment with one of two outcomes:

- **Validation Passed** — all required fields are present, URLs are valid, and category/package_type values are recognized. Your PR will be labeled `ready-for-review`.
- **Validation Failed** — the comment lists specific errors to fix. Push your corrections and the workflow will re-run. Your PR will be labeled `needs-changes`.

Common validation errors:
- Missing required fields (`name`, `github_url`, `package_name`, `description`)
- `github_url` does not start with `https://github.com/`
- Invalid `package_type` — must be `npm`, `pypi`, or `docker`
- Invalid `category` — must be one of the values listed above

## Review Timeline

We aim to review passing submissions within **48 hours**. If your PR has been open longer than that with no activity, feel free to leave a comment to ping the maintainers.
