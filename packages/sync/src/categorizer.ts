import { SupabaseClient } from '@supabase/supabase-js';
import { CATEGORIES, CATEGORY_KEYWORDS, type Category } from '@mcpfind/shared';

function categorizeServer(
  name: string,
  description: string | null,
  tags: string[],
  packageName: string | null
): Category {
  const searchText = `${name} ${description || ''} ${tags.join(' ')}`.toLowerCase();

  // 1. Check tags first (most reliable)
  for (const category of CATEGORIES) {
    if (category === 'other') continue;
    const keywords = CATEGORY_KEYWORDS[category];
    if (tags.some(tag => keywords.some(kw => tag.toLowerCase().includes(kw)))) {
      return category;
    }
  }

  // 2. Keyword matching on name + description
  for (const category of CATEGORIES) {
    if (category === 'other') continue;
    const keywords = CATEGORY_KEYWORDS[category];
    if (keywords.some(kw => searchText.includes(kw))) {
      return category;
    }
  }

  // 3. Package scope analysis
  if (packageName?.startsWith('@modelcontextprotocol/')) {
    // Official packages — try to categorize from name
    const officialName = packageName.replace('@modelcontextprotocol/', '');
    for (const category of CATEGORIES) {
      if (category === 'other') continue;
      const keywords = CATEGORY_KEYWORDS[category];
      if (keywords.some(kw => officialName.includes(kw))) {
        return category;
      }
    }
  }

  return 'other';
}

type ServerRow = {
  id: string;
  name: string;
  description: string | null;
  registry_tags: string[] | null;
  package_name: string | null;
  category: string | null;
};

export async function categorizeServers(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>
): Promise<number> {
  // Get servers without categories or with 'other' that might be recategorized
  const { data: rawServers, error } = await supabase
    .from('servers')
    .select('id, name, description, registry_tags, package_name, category');

  if (error || !rawServers) {
    console.error('Failed to fetch servers for categorization:', error?.message);
    return 0;
  }

  const servers = rawServers as ServerRow[];
  let categorized = 0;

  for (const server of servers) {
    const newCategory = categorizeServer(
      server.name,
      server.description,
      server.registry_tags || [],
      server.package_name
    );

    // Only update if category changed
    if (newCategory !== server.category) {
      const { error: updateError } = await supabase
        .from('servers')
        .update({ category: newCategory })
        .eq('id', server.id);

      if (!updateError) categorized++;
    }
  }

  return categorized;
}
