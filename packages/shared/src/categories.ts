export const CATEGORIES = [
  'databases',
  'cloud',
  'devtools',
  'communication',
  'filesystems',
  'search',
  'ai-ml',
  'finance',
  'crm',
  'productivity',
  'other',
] as const;

export type Category = typeof CATEGORIES[number];

export const CATEGORY_LABELS: Record<Category, string> = {
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

export const CATEGORY_KEYWORDS: Record<Category, string[]> = {
  databases: ['postgres', 'postgresql', 'mysql', 'sqlite', 'mongodb', 'redis', 'supabase', 'database', 'db', 'sql'],
  cloud: ['aws', 'gcp', 'azure', 'cloudflare', 'cloud', 'lambda', 's3'],
  devtools: ['github', 'gitlab', 'jira', 'linear', 'sentry', 'git', 'ci', 'cd'],
  communication: ['slack', 'discord', 'email', 'teams', 'chat', 'message'],
  filesystems: ['filesystem', 'file', 'google drive', 'dropbox', 'storage'],
  search: ['brave', 'search', 'google', 'web', 'scraping', 'wikipedia', 'crawl'],
  'ai-ml': ['openai', 'model', 'vector', 'embedding', 'llm', 'ai', 'ml', 'huggingface'],
  finance: ['stripe', 'payment', 'banking', 'finance', 'invoice'],
  crm: ['salesforce', 'hubspot', 'crm', 'customer'],
  productivity: ['notion', 'calendar', 'todoist', 'trello', 'asana', 'productivity'],
  other: [],
};
