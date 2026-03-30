export const CATEGORIES = [
  'databases',
  'cloud',
  'monitoring',
  'security',
  'testing',
  'analytics',
  'automation',
  'media',
  'documentation',
  'social',
  'ecommerce',
  'devtools',
  'communication',
  'filesystems',
  'search',
  'ai-ml',
  'finance',
  'crm',
  'productivity',
  'maps',
  'other',
] as const;

export type Category = typeof CATEGORIES[number];

export const CATEGORY_LABELS: Record<Category, string> = {
  databases: 'Databases',
  cloud: 'Cloud Providers',
  monitoring: 'Monitoring & Observability',
  security: 'Security & Auth',
  testing: 'Testing & Quality',
  analytics: 'Analytics & BI',
  automation: 'Automation & Workflow',
  media: 'Media & Images',
  documentation: 'Documentation',
  social: 'Social Media',
  ecommerce: 'E-Commerce',
  devtools: 'Developer Tools',
  communication: 'Communication',
  filesystems: 'File Systems',
  search: 'Search & Knowledge',
  'ai-ml': 'AI & ML',
  finance: 'Finance',
  crm: 'CRM',
  productivity: 'Productivity',
  maps: 'Maps & Location',
  other: 'Other',
};

export const CATEGORY_KEYWORDS: Record<Category, string[]> = {
  databases: ['postgres', 'postgresql', 'mysql', 'sqlite', 'mongodb', 'redis', 'supabase', 'database', 'db', 'sql', 'nosql'],
  cloud: ['aws', 'gcp', 'azure', 'cloudflare', 'cloud', 'lambda', 's3'],
  monitoring: ['datadog', 'grafana', 'prometheus', 'pagerduty', 'newrelic', 'sentry', 'monitoring', 'observability', 'alerting', 'metrics', 'logging', 'tracing', 'honeycomb'],
  security: ['vault', 'auth', 'oauth', 'jwt', 'secrets', 'keycloak', 'okta', 'security', 'permissions', 'rbac', 'certificate', 'ldap', 'auth0', 'authentication', 'authorization'],
  testing: ['jest', 'playwright', 'cypress', 'selenium', 'testing', 'test', 'vitest', 'puppeteer', 'e2e', 'mock', 'fixture'],
  analytics: ['amplitude', 'mixpanel', 'bigquery', 'looker', 'tableau', 'analytics', 'posthog', 'segment', 'metabase', 'dashboard', 'report'],
  automation: ['zapier', 'n8n', 'make', 'webhook', 'workflow', 'automation', 'trigger', 'pipedream', 'ci', 'cd', 'cron'],
  media: ['ffmpeg', 'image', 'video', 'audio', 'youtube', 'spotify', 'screenshot', 'ocr', 'media', 'photo', 'thumbnail', 'podcast', 'imagemagick'],
  documentation: ['readme', 'docs', 'docusaurus', 'confluence', 'documentation', 'swagger', 'openapi', 'wiki', 'markdown', 'spec'],
  social: ['twitter', 'linkedin', 'instagram', 'reddit', 'mastodon', 'bluesky', 'x.com', 'social', 'facebook'],
  ecommerce: ['shopify', 'woocommerce', 'magento', 'cart', 'order', 'inventory', 'product', 'sku', 'bigcommerce', 'storefront'],
  devtools: ['github', 'gitlab', 'jira', 'linear', 'git', 'gitea', 'gitpod'],
  communication: ['slack', 'discord', 'email', 'teams', 'chat', 'message', 'chatbot'],
  filesystems: ['filesystem', 'file', 'google drive', 'dropbox', 'storage'],
  search: ['brave', 'search', 'google', 'web', 'scraping', 'wikipedia', 'crawl'],
  'ai-ml': ['openai', 'model', 'vector', 'embedding', 'llm', 'ai', 'ml', 'huggingface'],
  finance: ['stripe', 'payment', 'banking', 'finance', 'invoice'],
  crm: ['salesforce', 'hubspot', 'crm', 'customer'],
  productivity: ['notion', 'calendar', 'todoist', 'trello', 'asana', 'productivity'],
  maps: ['mapbox', 'openstreetmap', 'geocoding', 'coordinates', 'geospatial', 'location', 'places'],
  other: [],
};

export const CATEGORY_FAQS: Record<Category, Array<{ question: string; answer: string }>> = {
  databases: [
    {
      question: 'What database MCP servers are available?',
      answer: 'MCP Find indexes PostgreSQL, MySQL, SQLite, MongoDB, Redis, Supabase, and other database integrations. Most support both read-only and read-write modes.',
    },
    {
      question: 'How do I connect an AI agent to my database?',
      answer: 'Install the MCP server for your database (e.g., postgres-mcp), add the config to your AI client (Claude Desktop, Cursor, VS Code), and the agent can query your database directly.',
    },
    {
      question: 'Can MCP servers handle database migrations?',
      answer: 'Some database MCP servers support schema introspection and migration generation. Check individual server docs for write capabilities — many default to read-only for safety.',
    },
  ],
  cloud: [
    {
      question: 'Which cloud providers have MCP servers?',
      answer: 'AWS, GCP, Azure, Cloudflare, Vercel, and Fly.io all have MCP server integrations for provisioning resources, querying logs, and managing deployments.',
    },
    {
      question: 'Can I manage infrastructure with an AI agent through MCP?',
      answer: 'Yes. Cloud MCP servers let agents list resources, read logs, trigger deploys, and in some cases provision new infrastructure — all through natural language in your AI client.',
    },
  ],
  monitoring: [
    {
      question: 'What monitoring platforms have MCP servers?',
      answer: 'Datadog, Grafana, Sentry, PagerDuty, New Relic, and Honeycomb all have MCP integrations. Agents can query metrics, check alert status, and pull error traces directly.',
    },
    {
      question: 'Can an AI agent help with on-call workflows through MCP?',
      answer: 'Monitoring MCP servers let agents inspect dashboards, read incident timelines, and correlate metrics across services — speeding up root-cause analysis during incidents.',
    },
  ],
  security: [
    {
      question: 'What security and auth MCP servers exist?',
      answer: 'There are MCP servers for Vault, Auth0, Okta, AWS Secrets Manager, and other identity and secrets platforms. They let agents audit access, rotate credentials, and check compliance posture.',
    },
    {
      question: 'Is it safe to give an AI agent access to security tools?',
      answer: 'Security MCP servers use scoped API keys and OAuth with minimal permissions. You control exactly what the agent can read or modify — most setups default to read-only access.',
    },
  ],
  testing: [
    {
      question: 'Which testing frameworks have MCP servers?',
      answer: 'Playwright, Cypress, Jest, Vitest, and Selenium all have MCP integrations. Agents can run test suites, interpret failures, and even generate new test cases.',
    },
    {
      question: 'Can an AI agent write and run tests through MCP?',
      answer: 'Yes. Testing MCP servers give agents access to test runners and results. Combined with code-editing tools, an agent can write tests, execute them, and iterate on failures.',
    },
  ],
  analytics: [
    {
      question: 'What analytics platforms have MCP servers?',
      answer: 'Google Analytics, Mixpanel, Amplitude, BigQuery, Metabase, and dbt all have MCP integrations. Agents can run queries, pull dashboards, and surface insights without manual scripting.',
    },
    {
      question: 'Can an AI agent generate reports from my analytics data?',
      answer: 'Analytics MCP servers feed structured data directly to the agent, which can summarize trends, compare time periods, and generate reports in natural language.',
    },
  ],
  automation: [
    {
      question: 'What automation platforms have MCP servers?',
      answer: 'Zapier, Make (formerly Integromat), n8n, and Pipedream all have MCP integrations. Agents can trigger workflows, check run status, and orchestrate multi-step automations.',
    },
    {
      question: 'How do automation MCP servers differ from just using APIs?',
      answer: 'Automation MCP servers let your agent trigger and manage existing workflows through natural language, without writing API calls. They bridge the gap between your agent and your automation stack.',
    },
  ],
  media: [
    {
      question: 'What media and image MCP servers are available?',
      answer: 'There are MCP servers for image generation (DALL-E, Stable Diffusion), video processing (FFmpeg), design tools (Figma, Canva), and screenshot capture. Agents can create, edit, and organize media assets.',
    },
    {
      question: 'Can an AI agent edit images through MCP?',
      answer: 'Media MCP servers support image generation, resizing, format conversion, and in some cases AI-powered editing. The agent handles the API calls while you describe what you want.',
    },
  ],
  documentation: [
    {
      question: 'What documentation platforms have MCP servers?',
      answer: 'Confluence, Gitbook, ReadMe, Mintlify, and Docusaurus all have MCP integrations. Agents can read, create, and update docs — useful for keeping documentation in sync with code.',
    },
    {
      question: 'Can MCP servers help reduce documentation rot?',
      answer: 'Documentation MCP servers let agents cross-reference code changes with existing docs and flag outdated content. Some teams use them to auto-generate changelogs and API references.',
    },
  ],
  social: [
    {
      question: 'Which social media platforms have MCP servers?',
      answer: 'Twitter/X, LinkedIn, Instagram, YouTube, Reddit, and Bluesky all have MCP integrations. Agents can read posts, publish content, track mentions, and pull engagement analytics.',
    },
    {
      question: 'Can an AI agent manage social media through MCP?',
      answer: 'Social MCP servers support content scheduling, social listening, and analytics retrieval. They require OAuth so you control exactly which accounts and actions the agent can access.',
    },
  ],
  ecommerce: [
    {
      question: 'What e-commerce platforms have MCP servers?',
      answer: 'Shopify, WooCommerce, BigCommerce, and similar platforms have MCP integrations. Agents can manage products, read orders, handle inventory, and pull sales data.',
    },
    {
      question: 'Can an AI agent handle customer service for my store?',
      answer: 'E-commerce MCP servers give agents access to order history, product catalogs, and customer data. Combined with communication servers, they can answer questions and process requests.',
    },
  ],
  devtools: [
    {
      question: 'What developer tool integrations does MCP offer?',
      answer: 'There are MCP servers for GitHub, GitLab, Jira, Linear, Sentry, and many more. They let AI agents create issues, review PRs, query error logs, and interact with your dev workflow.',
    },
    {
      question: 'How do MCP servers fit into a CI/CD pipeline?',
      answer: 'MCP servers connect your AI client to tools like GitHub Actions, CircleCI, and Jenkins. Agents can check build status, read logs, and help debug failed pipelines without leaving the chat.',
    },
  ],
  communication: [
    {
      question: 'Can AI agents send messages through MCP servers?',
      answer: 'Communication MCP servers support Slack, Discord, email, and Microsoft Teams. Depending on the server, agents can read channels, send messages, or summarize conversations.',
    },
    {
      question: 'Are communication MCP servers safe to use?',
      answer: 'Most communication servers require explicit OAuth or API key setup and support scoped permissions. You control exactly which channels or mailboxes the agent can access.',
    },
  ],
  filesystems: [
    {
      question: 'How do file system MCP servers work?',
      answer: 'File system MCP servers give AI agents controlled access to local directories, Google Drive, Dropbox, or S3 buckets. You configure which paths are accessible and whether writes are allowed.',
    },
    {
      question: 'Is it safe to let an AI agent access my files?',
      answer: 'File system servers let you allowlist specific directories and set read-only mode. The agent only sees files you explicitly permit — nothing outside the configured scope.',
    },
    {
      question: 'Can I use MCP to search across documents?',
      answer: 'Several file system servers support full-text search and content extraction from PDFs, Word docs, and other formats, making it easy for agents to find information across your files.',
    },
  ],
  search: [
    {
      question: 'What search and knowledge MCP servers exist?',
      answer: 'MCP Find lists servers for Brave Search, Google, Wikipedia, web scraping, and specialized knowledge bases. They let agents fetch live information beyond their training data.',
    },
    {
      question: 'How does web search through MCP differ from a normal search?',
      answer: 'Instead of returning a list of links, search MCP servers feed structured results directly to the AI agent, which can synthesize answers, compare sources, and cite references in its response.',
    },
  ],
  'ai-ml': [
    {
      question: 'What AI and ML MCP servers are available?',
      answer: 'There are MCP servers for OpenAI, Hugging Face, vector databases like Pinecone and Weaviate, and various embedding services. They let agents orchestrate multi-model workflows.',
    },
    {
      question: 'Can I chain multiple AI models together using MCP?',
      answer: 'Yes — AI/ML MCP servers enable agents to call external models, store and query embeddings, and pipe outputs between services, all from a single conversation.',
    },
    {
      question: 'Do AI/ML MCP servers support local models?',
      answer: 'Several servers integrate with Ollama, llama.cpp, and other local inference tools, so your agent can leverage on-device models without sending data to external APIs.',
    },
  ],
  finance: [
    {
      question: 'What finance-related MCP servers are available?',
      answer: 'MCP Find lists servers for Stripe, payment processing, banking APIs, invoicing tools, and financial data providers. They bring financial operations into your AI workflow.',
    },
    {
      question: 'Can an AI agent process payments through MCP?',
      answer: 'Finance MCP servers like Stripe integrations can create invoices, check payment status, and manage subscriptions. Sensitive operations typically require explicit confirmation steps.',
    },
  ],
  crm: [
    {
      question: 'Which CRM platforms have MCP servers?',
      answer: 'Salesforce, HubSpot, and other CRM platforms have MCP server integrations. Agents can look up contacts, update deal stages, and pull reports directly from your CRM.',
    },
    {
      question: 'How do CRM MCP servers handle sensitive customer data?',
      answer: 'CRM servers authenticate via OAuth or API keys with scoped permissions. You control which objects and fields the agent can read or modify, just like any other API integration.',
    },
  ],
  productivity: [
    {
      question: 'What productivity tools have MCP servers?',
      answer: 'Notion, Google Calendar, Todoist, Trello, Asana, and other productivity apps have MCP integrations. Agents can create tasks, schedule events, and organize notes on your behalf.',
    },
    {
      question: 'Can an AI agent manage my calendar through MCP?',
      answer: 'Calendar MCP servers let agents check availability, create events, and send invites. Most require OAuth consent so you stay in control of what gets scheduled.',
    },
    {
      question: 'Do productivity MCP servers work across multiple apps?',
      answer: 'You can install multiple productivity MCP servers at once. An agent could check your Notion docs, create a Trello card, and add a calendar reminder — all in one conversation.',
    },
  ],
  maps: [
    {
      question: 'What mapping and location MCP servers are available?',
      answer: 'Google Maps, Mapbox, OpenStreetMap, and geocoding APIs all have MCP integrations. Agents can resolve addresses, calculate routes, find nearby places, and work with geospatial data.',
    },
    {
      question: 'Can an AI agent build location-aware features through MCP?',
      answer: 'Maps MCP servers provide geocoding, routing, and place search capabilities. Agents can convert addresses to coordinates, estimate travel times, and query points of interest.',
    },
  ],
  other: [
    {
      question: 'What kinds of MCP servers are in the Other category?',
      answer: 'The Other category includes servers that don\'t fit neatly into a single domain — things like browser automation, IoT integrations, custom API wrappers, and experimental tools.',
    },
    {
      question: 'How do I find the right MCP server for my use case?',
      answer: 'Use the search and filter tools on MCP Find to narrow by capability, language, or keyword. Every server listing includes install instructions and a link to its source repository.',
    },
  ],
};

export const CATEGORY_DESCRIPTIONS: Record<Category, string> = {
  databases: 'Connect your AI agent to the databases it needs. This category covers MCP servers for PostgreSQL, MySQL, SQLite, MongoDB, Redis, and more. Whether you\'re querying production data, running migrations, or letting an agent manage a local dev database, you\'ll find integrations here. Most servers support both read-only and read-write modes so you can pick the right level of access.',
  cloud: 'MCP servers for the big cloud providers — AWS, GCP, Azure — plus platforms like Vercel, Fly.io, and Cloudflare. Use these to let your agent provision resources, query logs, manage deployments, or inspect infrastructure state. Useful when you want an agent that can actually do things in your cloud environment, not just talk about it.',
  monitoring: 'Servers for observability platforms — Datadog, Grafana, Sentry, PagerDuty, New Relic, and similar tools. Let your agent query metrics, inspect error logs, check alert status, or pull APM traces. Particularly useful for on-call workflows or agents that need to diagnose production issues without someone manually pulling dashboards.',
  security: 'Integrations with security and auth infrastructure: identity providers (Auth0, Okta), secrets managers (Vault, AWS Secrets Manager), vulnerability scanners, and compliance tools. Use these when building agents that need to handle credentials safely, audit access, or interact with security tooling in your stack.',
  testing: 'Testing frameworks, QA tools, and code quality platforms. You\'ll find unit test runners, end-to-end tools like Playwright and Cypress, coverage reporters, and static analysis services. The idea: agents that can write tests, run suites, interpret what broke, and flag regressions on their own.',
  analytics: 'Your analytics and BI infrastructure, wired up for agents: Google Analytics, Mixpanel, Amplitude, BigQuery, dbt, and more. Pull usage metrics, run queries, check dashboards, or surface insights without writing one-off scripts. Especially handy when you\'d rather not be the one manually running analyst queries every week.',
  automation: 'Integrations with workflow and automation platforms: Zapier, Make (formerly Integromat), n8n, Pipedream, and similar tools. Use these to trigger existing automations from an agent, or to build agents that orchestrate multi-step workflows across services that don\'t have their own MCP servers yet.',
  media: 'Everything images, video, audio, and design. Covers image generation (DALL-E, Stable Diffusion), editing APIs, video processing, screenshot capture, and design tools like Figma and Canva. Basically — if your agent works with media files or creative assets, look here first.',
  documentation: 'MCP servers for documentation platforms and tools: Confluence, Gitbook, ReadMe, Mintlify, and similar. Agents can read existing docs, create or update pages, search knowledge bases, and keep documentation in sync with code changes. Particularly useful for teams trying to reduce doc rot.',
  social: 'Social media platform integrations — Twitter/X, LinkedIn, Instagram, YouTube, Reddit, and others. Your agent can read posts, publish content, track mentions, and pull analytics. Works well for content scheduling, social listening, or really anything that needs programmatic access to public platform APIs.',
  ecommerce: 'Shopify, WooCommerce, BigCommerce, and similar e-commerce platform servers. Agents can manage products, read orders, handle inventory, process refunds, and pull sales data. Whether it\'s store management, customer service automation, or reporting — the commerce backend integrations live here.',
  devtools: 'Integrations that plug your AI agent into the tools you already use to build software. Think GitHub, GitLab, Docker, terminal access, package registries, and CI systems. If it\'s part of your development workflow and you want an agent to interact with it directly, it probably lives here.',
  communication: 'The places where work conversations happen: Slack, Discord, email, SMS, and more. These MCP servers let agents send messages, read threads, post to channels, and fire off notifications. Handy if you\'re building something that surfaces information where your team already looks — no new tool required.',
  filesystems: 'MCP servers for reading and writing files — local disk, cloud storage (S3, GCS, R2), and shared drives (Google Drive, Dropbox). Agents can read docs, write outputs, manage directories, or sync files between locations. The building block for most agents that need to work with documents or data files.',
  search: 'Give your agent the ability to find things. This category includes web search engines (Brave, Tavily, Exa), semantic and vector search, knowledge bases, and Wikipedia/docs integrations. Use these when your agent needs to look something up rather than rely solely on what\'s already in its context.',
  'ai-ml': 'Servers for integrating AI services directly into your agent workflows. Image generation, speech-to-text, embeddings, model APIs, and vector stores all live here. Useful when you\'re building agents that chain multiple AI capabilities together or need to call specialized models for specific subtasks.',
  finance: 'Financial data and services for your agent stack — market data feeds, stock prices, crypto APIs, accounting platforms like QuickBooks, and payment processors. Building a trading assistant? An expense tracker? Something that generates financial reports? Start here.',
  crm: 'Your CRM and sales tools, connected to agents: Salesforce, HubSpot, Pipedrive, and the like. These integrations let agents read contacts, update records, log activities, and pull pipeline data. They\'re most valuable for sales automation and customer research — especially keeping CRM data accurate without someone doing manual entry.',
  productivity: 'The catch-all for tools that help people get work done: Notion, Airtable, Todoist, Google Workspace, and more. If you want an agent that can manage tasks, update project trackers, or coordinate information across your productivity stack, this is the place to look.',
  maps: 'Mapping and location services: Google Maps, Mapbox, OpenStreetMap, geocoding APIs, and routing engines. Good for resolving addresses, calculating distances, finding nearby places, or building anything location-aware. Also covers geospatial data services for more advanced use cases.',
  other: "Servers that don't fit neatly into a specific category. Browse these to find integrations that span multiple domains or cover niche use cases.",
};

export const CATEGORY_LLM_DESCRIPTIONS: Record<Exclude<Category, 'other'>, string> = {
  databases: 'PostgreSQL, MySQL, MongoDB, Redis, SQLite, and relational/NoSQL database MCP integrations for querying and managing data.',
  cloud: 'AWS, GCP, Azure, Vercel, Cloudflare, and cloud infrastructure MCP integrations for provisioning and deployment.',
  monitoring: 'Datadog, Grafana, Sentry, PagerDuty, New Relic, and observability platform MCP integrations.',
  security: 'Auth0, Okta, HashiCorp Vault, AWS Secrets Manager, and security/identity platform MCP integrations.',
  testing: 'Playwright, Cypress, Jest, Vitest, and testing framework/QA tool MCP integrations.',
  analytics: 'Google Analytics, Mixpanel, Amplitude, BigQuery, dbt, and analytics/BI platform MCP integrations.',
  automation: 'Zapier, Make, n8n, Pipedream, and workflow automation platform MCP integrations.',
  media: 'DALL-E, Stable Diffusion, Figma, Canva, FFmpeg, and image/video/design tool MCP integrations.',
  documentation: 'Confluence, Gitbook, ReadMe, Mintlify, and documentation platform MCP integrations.',
  social: 'Twitter/X, LinkedIn, Instagram, YouTube, Reddit, and social media platform MCP integrations.',
  ecommerce: 'Shopify, WooCommerce, BigCommerce, and e-commerce platform MCP integrations for store and order management.',
  devtools: 'GitHub, GitLab, Docker, terminal access, CI/CD systems, and developer workflow MCP integrations.',
  communication: 'Slack, Discord, email (Gmail, SMTP), SMS (Twilio), and messaging platform MCP integrations.',
  filesystems: 'Local disk, S3, Google Drive, Dropbox, R2, and cloud storage MCP integrations for file read/write operations.',
  search: 'Brave Search, Tavily, Exa, vector search, Wikipedia, and knowledge base MCP integrations for information retrieval.',
  'ai-ml': 'OpenAI, Replicate, Hugging Face, Pinecone, and AI model/embedding/image-generation MCP integrations.',
  finance: 'Stock market data, crypto APIs, QuickBooks, Stripe, and financial data platform MCP integrations.',
  crm: 'Salesforce, HubSpot, Pipedrive, and customer relationship management platform MCP integrations.',
  productivity: 'Notion, Airtable, Google Workspace, Todoist, Asana, and productivity tool MCP integrations.',
  maps: 'Google Maps, Mapbox, OpenStreetMap, geocoding APIs, and location/routing service MCP integrations.',
};
