import { SupabaseClient } from '@supabase/supabase-js';
import { GITHUB_API_BASE, GITHUB_RATE_DELAY_MS } from '@mcpfind/shared';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function parseGithubUrl(url: string): { owner: string; repo: string } | null {
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (!match) return null;
  return { owner: match[1]!, repo: match[2]!.replace(/\.git$/, '') };
}

export async function enrichWithGitHub(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  githubToken: string
): Promise<number> {
  // Fix 3: Only enrich servers not updated in the last 24 hours (staleness filter)
  const { data: rawServers, error } = await supabase
    .from('servers')
    .select('id, github_url')
    .not('github_url', 'is', null)
    .or('updated_at.lt.' + new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString() + ',github_stars.eq.0');

  if (error || !rawServers) {
    console.error('Failed to fetch servers for enrichment:', error?.message);
    return 0;
  }

  const servers = rawServers as Array<{ id: string; github_url: string }>;
  let enriched = 0;
  const headers = {
    Authorization: `Bearer ${githubToken}`,
    Accept: 'application/vnd.github.v3+json',
  };

  for (const server of servers) {
    const parsed = parseGithubUrl(server.github_url);
    if (!parsed) continue;

    try {
      // Fetch repo metadata with retry on rate limit
      let repoRes: Response | null = null;
      const MAX_RETRIES = 3;
      for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        repoRes = await fetch(
          `${GITHUB_API_BASE}/repos/${parsed.owner}/${parsed.repo}`,
          { headers }
        );
        if (repoRes.status === 403) {
          const retryAfter = repoRes.headers.get('retry-after');
          const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 60000;
          console.warn(`Rate limited (attempt ${attempt + 1}/${MAX_RETRIES}), waiting ${waitMs}ms`);
          await sleep(waitMs);
          // retry the same server
        } else {
          break;
        }
      }
      if (!repoRes || repoRes.status === 403) {
        console.warn(`Skipping ${parsed.owner}/${parsed.repo} after ${MAX_RETRIES} rate-limit retries`);
        continue;
      }

      if (!repoRes.ok) {
        console.warn(`GitHub API ${repoRes.status} for ${parsed.owner}/${parsed.repo}`);
        await sleep(GITHUB_RATE_DELAY_MS);
        continue;
      }

      const repo = await repoRes.json();

      // Fetch README
      let readmeContent: string | null = null;
      try {
        const readmeRes = await fetch(
          `${GITHUB_API_BASE}/repos/${parsed.owner}/${parsed.repo}/readme`,
          { headers: { ...headers, Accept: 'application/vnd.github.raw' } }
        );
        if (readmeRes.ok) {
          readmeContent = await readmeRes.text();
          // Truncate very long READMEs
          if (readmeContent.length > 50000) {
            readmeContent = readmeContent.slice(0, 50000);
          }
        }
      } catch {
        // README fetch failed, continue without it
      }

      // Fetch contributor count
      let contributorCount = 0;
      try {
        const contribRes = await fetch(
          `${GITHUB_API_BASE}/repos/${parsed.owner}/${parsed.repo}/contributors?per_page=1`,
          { headers }
        );
        if (contribRes.ok) {
          // Parse Link header for total count
          const linkHeader = contribRes.headers.get('link');
          if (linkHeader) {
            const lastMatch = linkHeader.match(/page=(\d+)>; rel="last"/);
            contributorCount = lastMatch ? parseInt(lastMatch[1]!, 10) : 1;
          } else {
            const contribs = await contribRes.json();
            contributorCount = Array.isArray(contribs) ? contribs.length : 0;
          }
        }
      } catch {
        // Contributor count failed, use 0
      }

      const { error: updateError } = await supabase
        .from('servers')
        .update({
          github_stars: repo.stargazers_count || 0,
          github_forks: repo.forks_count || 0,
          github_open_issues: repo.open_issues_count || 0,
          github_last_push: repo.pushed_at || null,
          github_license: repo.license?.spdx_id || null,
          github_language: repo.language || null,
          github_contributors: contributorCount,
          github_archived: repo.archived || false,
          readme_content: readmeContent,
          updated_at: new Date().toISOString(),
        })
        .eq('id', server.id);

      if (updateError) {
        console.error(`Failed to update ${server.id}:`, updateError.message);
      } else {
        enriched++;
      }
    } catch (err) {
      console.error(`Error enriching ${server.id}:`, err);
    }

    await sleep(GITHUB_RATE_DELAY_MS);
  }

  return enriched;
}
