import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function json(response, statusCode, body) {
  response.writeHead(statusCode, { 'content-type': 'application/json' });
  response.end(JSON.stringify(body));
}

async function startApiFixture() {
  const requests = [];
  const fixture = createServer((request, response) => {
    const url = new URL(request.url, `http://${request.headers.host}`);
    requests.push(url);

    if (url.pathname === '/api/servers') {
      return json(response, 200, {
        servers: [{
          name: 'Fixture Search Server',
          slug: 'fixture-search',
          description: 'A deterministic MCP server used by the protocol test.',
          category: 'search',
          github_stars: 42,
          github_license: 'MIT',
          package_type: 'npm',
          is_official: true,
        }],
      });
    }

    if (url.pathname === '/api/servers/fixture-search') {
      return json(response, 200, {
        name: 'Fixture Search Server',
        slug: 'fixture-search',
        description: 'A deterministic MCP server used by the protocol test.',
        category: 'search',
        version: '1.2.3',
        package_name: '@fixture/search',
        package_type: 'npm',
        github_url: 'https://github.com/example/fixture-search',
        github_stars: 42,
        github_license: 'MIT',
        github_last_push: '2026-09-13T00:00:00.000Z',
        is_official: true,
        tools: [{ tool_name: 'search', tool_description: 'Search fixture records.', input_schema: { type: 'object' } }],
        readme_content: 'Fixture README content.',
      });
    }

    if (url.pathname === '/api/servers/missing') return json(response, 404, { error: 'not found' });

    if (url.pathname === '/api/servers/fixture-search/config/claude-code') {
      return json(response, 200, { command: 'npx', args: ['-y', '@fixture/search'] });
    }

    return json(response, 404, { error: `Unexpected fixture request: ${url.pathname}` });
  });

  fixture.listen(0, '127.0.0.1');
  await once(fixture, 'listening');
  const address = fixture.address();
  assert(address && typeof address === 'object');

  return {
    url: `http://127.0.0.1:${address.port}/api`,
    requests,
    close: () => new Promise((resolveClose, rejectClose) => fixture.close(error => error ? rejectClose(error) : resolveClose())),
  };
}

function textResult(result) {
  assert.equal(result.content.length, 1, 'tool returns one text content item');
  assert.equal(result.content[0].type, 'text');
  return result.content[0].text;
}

const packageJson = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8'));
const fixture = await startApiFixture();
const serverEntry = process.env.MCPFIND_SERVER_ENTRY || resolve(packageRoot, 'dist/index.js');
const serverCommand = process.env.MCPFIND_SERVER_COMMAND || process.execPath;
const transport = new StdioClientTransport({
  command: serverCommand,
  args: process.env.MCPFIND_SERVER_COMMAND ? [] : [serverEntry],
  cwd: packageRoot,
  env: { MCPFIND_API_URL: fixture.url },
  stderr: 'pipe',
});
const client = new Client({ name: 'mcpfind-protocol-test', version: '1.0.0' });

try {
  await client.connect(transport);
  assert.deepEqual(client.getServerVersion(), { name: 'mcpfind', version: packageJson.version });

  const toolList = await client.listTools();
  const toolsByName = new Map(toolList.tools.map(tool => [tool.name, tool]));
  assert.deepEqual([...toolsByName.keys()].sort(), ['get_install_config', 'get_server_details', 'search_servers']);
  assert.equal(toolsByName.get('search_servers').inputSchema.properties.limit.minimum, 1);
  assert.equal(toolsByName.get('search_servers').inputSchema.properties.limit.maximum, 20);
  assert.deepEqual(toolsByName.get('get_install_config').inputSchema.required.sort(), ['client', 'server_id']);

  const search = await client.callTool({
    name: 'search_servers',
    arguments: { query: 'fixture', category: 'search', sort_by: 'stars', limit: 3 },
  });
  assert.deepEqual(JSON.parse(textResult(search)), [{
    name: 'Fixture Search Server', slug: 'fixture-search',
    description: 'A deterministic MCP server used by the protocol test.',
    category: 'search', stars: 42, license: 'MIT', package_type: 'npm', is_official: true,
  }]);
  const searchRequest = fixture.requests.at(-1);
  assert.equal(searchRequest.pathname, '/api/servers');
  assert.deepEqual(Object.fromEntries(searchRequest.searchParams), { q: 'fixture', category: 'search', sort: 'stars', limit: '3' });

  const detail = await client.callTool({ name: 'get_server_details', arguments: { server_id: 'fixture-search' } });
  assert.equal(JSON.parse(textResult(detail)).tools[0].name, 'search');
  assert.equal(JSON.parse(textResult(detail)).readme_excerpt, 'Fixture README content.');

  const installConfig = await client.callTool({
    name: 'get_install_config', arguments: { server_id: 'fixture-search', client: 'claude-code' },
  });
  assert.deepEqual(JSON.parse(textResult(installConfig)), { command: 'npx', args: ['-y', '@fixture/search'] });

  const missing = await client.callTool({ name: 'get_server_details', arguments: { server_id: 'missing' } });
  assert.equal(missing.isError, true);
  assert.match(textResult(missing), /Server "missing" not found\./);
} finally {
  await client.close();
  await fixture.close();
}

console.log('MCP protocol contract verified.');
