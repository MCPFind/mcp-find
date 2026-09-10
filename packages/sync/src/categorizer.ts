import { SupabaseClient } from '@supabase/supabase-js';
import { CATEGORIES, CATEGORY_KEYWORDS, type Category } from '@mcpfind/shared';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function matchesKeyword(text: string, keyword: string): boolean {
  // Multi-word keywords (e.g., "google drive") use literal match — spaces act as natural boundaries
  if (keyword.includes(' ')) {
    return text.includes(keyword);
  }
  // Single-word keywords use word-boundary regex
  const pattern = new RegExp(`\\b${escapeRegex(keyword)}\\b`, 'i');
  return pattern.test(text);
}

export function categorizeServer(
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
    if (tags.some(tag => keywords.some(kw => matchesKeyword(tag.toLowerCase(), kw)))) {
      return category;
    }
  }

  // Specific product names outweigh incidental terms in a description (a
  // calendar integration mentioning search or files is still productivity).
  const identity = `${name} ${packageName || ''}`.toLowerCase();
  if (/\b(?:google[- _]?calendar|gcalendar|gcal|todoist|trello|asana)\b/.test(identity)) return 'productivity';

  // 2. Keyword matching on name + description
  for (const category of CATEGORIES) {
    if (category === 'other') continue;
    const keywords = CATEGORY_KEYWORDS[category];
    if (keywords.some(kw => matchesKeyword(searchText, kw))) {
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
      if (keywords.some(kw => matchesKeyword(officialName, kw))) {
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
  supabase: SupabaseClient<any, any, any>,
  onProgress?: (total: number) => void
): Promise<number> {
  let categorized = 0;
  // Requery the first bounded page: successful updates leave the null set.
  // Offsetting a shrinking result would silently skip entries.
  for (;;) {
    const { data, error } = await supabase.from('servers')
      .select('id,name,description,registry_tags,package_name,category')
      .is('category', null).order('id').limit(500);
    if (error || !data) throw new Error(`Categorization read failed: ${error?.message ?? 'missing data'}`);
    const servers = data as ServerRow[];
    if (!servers.length) return categorized;
    const updates = new Map<Category, string[]>();
    for (const server of servers) {
      const category = categorizeServer(server.name, server.description, server.registry_tags || [], server.package_name);
      updates.set(category, [...(updates.get(category) || []), server.id]);
    }
    for (const [category, ids] of updates) {
      for (let offset = 0; offset < ids.length; offset += 200) {
        const batch = ids.slice(offset, offset + 200);
        const { error } = await supabase.from('servers')
          .update({ category, updated_at: new Date().toISOString() }).in('id', batch);
        if (error) throw new Error(`Categorization write failed: ${error.message}`);
        categorized += batch.length;
        onProgress?.(categorized);
      }
    }
  }
}
