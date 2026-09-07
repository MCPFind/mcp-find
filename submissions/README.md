# submissions/

One-file-per-server intake directory for community submissions.

This directory exists because the [submit form](https://mcpfind.org/submit) hands
contributors a prefilled GitHub "create new file" link, and that GitHub flow can
only ever create a *new* file — it cannot append an entry to the existing
`community-servers.yml`. Rather than ask every contributor to hand-edit a shared
file, one-click submissions land here as `submissions/<your-server>.yml`.

Both intake paths are equally valid and both are validated by the same CI checks:

| Route | File | Who uses it |
|-------|------|-------------|
| Submit form (one click) | `submissions/<your-server>.yml` | Most contributors |
| Manual edit | `community-servers.yml` | Contributors editing by hand |

## File format

A file in this directory uses the exact same shape as `community-servers.yml` —
a top-level `servers` array — and normally contains a single entry:

```yaml
servers:
  - name: "My MCP Server"
    github_url: "https://github.com/owner/repo"
    package_name: "my-mcp-server"
    description: "One-sentence description of what this server does."
    package_type: "npm"
    category: "devtools"
```

See [CONTRIBUTING.md](../CONTRIBUTING.md) for the full field reference, the list
of valid `category` values, and the review process.

## Validation

Every PR touching this directory runs:

- **Validate Community Submission** (`.github/workflows/validate-pr.yml`) — structural
  checks on required fields, URL shape, description length, `package_type`, `category`.
- **Verify Submission Liveness** (`.github/workflows/verify-submission.yml`) — the repo
  is public, a license is present, and the declared package actually exists on the
  registry.

Both write their results to the GitHub Actions **job summary** on the PR's Checks
tab. A red check means something needs fixing; open the check to read the details.
