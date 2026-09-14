import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readme = await readFile(resolve(packageRoot, 'README.md'), 'utf8');
const packageJson = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));
assert.equal(packageJson.name, '@mcpfind/server', 'package keeps its public identity');
assert.equal(packageJson.license, 'MIT', 'package declares its license');
assert.deepEqual(packageJson.files, ['dist', 'README.md', 'LICENSE'], 'package ships only runtime, README, and license files');
assert.equal(packageJson.publishConfig?.access, 'public', 'scoped package is configured for public publication');
assert(!Object.values(packageJson.dependencies ?? {}).some(version => version === 'workspace:*'), 'published runtime dependencies are registry-resolvable');
assert.match(await readFile(resolve(packageRoot, 'LICENSE'), 'utf8'), /^MIT License/m, 'package includes its license text');
const clientConfigurationSection = readme.match(/## Client configuration\s+([\s\S]*?)(?=\n## |$)/);

assert(clientConfigurationSection, 'README has a Client configuration section');
const clientConfigMatch = clientConfigurationSection[1].match(/```json\s*([\s\S]*?)```/);
assert(clientConfigMatch, 'README contains a JSON client configuration block');
const clientConfig = JSON.parse(clientConfigMatch[1]);
assert.deepEqual(clientConfig, {
  mcpServers: {
    mcpfind: { command: 'npx', args: ['-y', packageJson.name] },
  },
});

const toolsSection = readme.match(/## Tools\s+([\s\S]*?)(?=\n## |$)/);
assert(toolsSection, 'README has a Tools section');
const documentedToolNames = [...toolsSection[1].matchAll(/^\| `([^`]+)` \|/gm)].map(match => match[1]).sort();
assert.equal(new Set(documentedToolNames).size, documentedToolNames.length, 'README lists each tool once');
assert.match(readme, /MCPFIND_API_URL/, 'README documents the API endpoint override');
assert.match(readme, /10-second timeout/, 'README documents the upstream timeout');
assert.match(readme, /unknown server returns an MCP tool error/i, 'README documents the not-found error behavior');
assert.match(readme, /canonical_url/, 'README documents the clean directory link');
assert.match(readme, /tracked_url/, 'README documents the attributed directory link');
assert.match(readme, /utm_source=mcp_server/, 'README documents the stable MCP referral source');
assert.match(readme, /does not install or execute/i, 'README documents that configuration output is not an installation action');

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [resolve(packageRoot, 'dist/index.js')],
  cwd: packageRoot,
  stderr: 'pipe',
});
const client = new Client({ name: 'mcpfind-docs-test', version: '1.0.0' });

try {
  await client.connect(transport);
  const runtimeToolNames = (await client.listTools()).tools.map(tool => tool.name).sort();
  assert.deepEqual(documentedToolNames, runtimeToolNames, 'README tool inventory matches the running server');
} finally {
  await client.close();
}

console.log('MCP server documentation contract verified.');
