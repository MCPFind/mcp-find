#!/usr/bin/env python3
"""Full production build with hostile DB, then HTTP tests against that artifact.
No production credentials or external database access. Intended for CI as well
as local reproduction of the credentialed-prerender failure.
"""
import json
import os
from pathlib import Path
import re
import shutil
import socket
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / 'apps/web'
state = {'mode': 'build', 'reads': 0}
row = dict(id='00000000-0000-0000-0000-000000000001', slug='fixture-server', canonical_slug='fixture-server',
           name='Fixture Server', description='Documented test server for build isolation.', version='1.0.0',
           category='databases', source='registry', package_name='fixture-server', package_type='npm',
           github_stars=5, github_archived=False, github_language='TypeScript', registry_status='active',
           has_tools=True, has_resources=False, has_prompts=False, tool_count=1,
           readme_content='Documented setup and usage. ' * 40, updated_at='2026-09-10T00:00:00Z',
           registry_updated_at='2026-09-10T00:00:00Z', created_at='2026-09-01T00:00:00Z',
           registry_tags=[], github_license='MIT')

class Database(BaseHTTPRequestHandler):
    def log_message(self, *_): pass
    def do_HEAD(self): self.do_GET()
    def do_GET(self):
        state['reads'] += 1
        q = parse_qs(urlparse(self.path).query)
        columns = q.get('select', [''])[0]
        status = 200
        if state['mode'] != 'healthy':
            status, data = 503, {'code': '57014', 'message': 'all database reads rejected by build fixture'}
        elif 'readme_length' in columns:
            status, data = 400, {'code': '42703', 'message': 'column servers.readme_length does not exist'}
        elif '/sync_log' in self.path:
            data = {'completed_at': '2026-09-10T00:00:00Z'}
        elif '/tools' in self.path or '/server_tools' in self.path:
            data = []
        else:
            matches = q.get('category', ['eq.databases'])[0] == 'eq.databases'
            offset = int(q.get('offset', ['0'])[0])
            data = [row] if matches and offset == 0 else []
            if 'application/vnd.pgrst.object+json' in self.headers.get('Accept', ''):
                data = row if data else None
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Range', '0-0/1' if status == 200 else '*/0')
        self.end_headers()
        if self.command != 'HEAD': self.wfile.write(json.dumps(data).encode())

def request(port, path, request_headers=None):
    try:
        response = urllib.request.urlopen(urllib.request.Request(f'http://127.0.0.1:{port}{path}', headers=request_headers or {}), timeout=30)
    except urllib.error.HTTPError as error:
        response = error
    return response.status, response.headers, response.read().decode()

with tempfile.TemporaryDirectory(prefix='mcpfind-build-isolation-') as tmp:
    db = ThreadingHTTPServer(('127.0.0.1', 0), Database)
    threading.Thread(target=db.serve_forever, daemon=True).start()
    env = dict(os.environ, SUPABASE_URL=f'http://127.0.0.1:{db.server_port}', SUPABASE_ANON_KEY='local-fixture-only')
    # This script owns the generated .next artifact. Clearing it prevents a
    # previous healthy cache from hiding accidental prerender database reads.
    shutil.rmtree(WEB / '.next', ignore_errors=True)
    logpath = Path(tmp) / 'build.log'
    with logpath.open('w') as log:
        result = subprocess.run(['pnpm', '--filter', '@mcpfind/web', 'build'], cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT)
    if result.returncode:
        print(logpath.read_text()[-16000:])
        raise SystemExit(result.returncode)
    assert state['reads'] == 0, f"Build queried database {state['reads']} times"
    manifest = json.loads((WEB / '.next/prerender-manifest.json').read_text())
    for route in manifest['routes']:
        assert not re.match(r'^/(directory-|categories|servers|blog/[^/]+$|llms|sitemap|api/health)', route), route
    for route in ['/directory-root/[surface]', '/directory-page/[page]', '/categories/[category]', '/servers/[slug]', '/blog/[slug]']:
        assert manifest['dynamicRoutes'][route]['fallback'] is None, route
    print('PASS: full production build; zero database reads; all DB pages use blocking on-demand ISR', flush=True)
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0)); port = sock.getsockname()[1]
    with (Path(tmp) / 'runtime.log').open('w') as log:
        server = subprocess.Popen(['pnpm', '--filter', '@mcpfind/web', 'exec', 'next', 'start', '--port', str(port)], cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            for _ in range(100):
                try:
                    request(port, '/robots.txt'); break
                except (OSError, urllib.error.URLError): time.sleep(.1)
            else: raise AssertionError('Runtime did not start')
            # Cold-cache outage must never become a cacheable empty API/text/XML.
            for path in ['/llms.txt', '/llms-full.txt', '/api/health', '/api/servers', '/api/servers/fixture-server', '/api/servers/fixture-server/config/claude-desktop', '/sitemap.xml', '/sitemap-static.xml', '/sitemap-servers-0.xml']:
                status, headers, body = request(port, path)
                assert status == 503, (path, status)
                assert 'no-store' in headers.get('Cache-Control', ''), path
            for path in ['/', '/categories', '/servers', '/servers?page=2', '/categories/databases', '/servers/fixture-server', '/servers?q=fixture']:
                status, headers, body = request(port, path)
                # Next14 owns page status; no proxy solely to rewrite errors.
                assert status == 500, (path, status)
                assert 'no-store' in headers.get('Cache-Control', ''), path
            state['mode'] = 'healthy'
            for path in ['/', '/categories', '/servers', '/categories/databases', '/servers/fixture-server', '/servers?q=fixture']:
                status, headers, body = request(port, path)
                assert status == 200, (path, status)
                canonical = 'https://mcpfind.org' + ('/servers' if '?' in path else path.rstrip('/'))
                assert f'rel="canonical" href="{canonical}"' in body, path
                if path != '/categories': assert 'Fixture Server' in body, path
                if '?' in path:
                    assert 'noindex, follow' in body and 'no-store' in headers.get('Cache-Control', ''), path
            before = state['reads']
            status, headers, body = request(port, '/servers')
            assert status == 200 and headers.get('x-nextjs-cache') == 'HIT', dict(headers)
            assert state['reads'] == before, 'Repeated ISR response queried DB'
            status, headers, body = request(port, '/servers', {'RSC': '1'})
            assert status == 200 and 'text/x-component' in headers.get('Content-Type', ''), dict(headers)
            for slug in ['bigquery-mcp-server-google-cloud-guide', 'brave-search-mcp-server-setup-guide', 'webflow-mcp-server-cms-governance-guide']:
                status, headers, body = request(port, '/blog/' + slug)
                assert status == 200 and f'rel="canonical" href="https://mcpfind.org/blog/{slug}"' in body, slug
                assert 'datePublished' in body and '2026-09-10' in body, slug
            for path in ['/llms.txt', '/llms-full.txt', '/sitemap.xml', '/sitemap-static.xml', '/sitemap-servers-0.xml', '/api/health', '/api/servers/fixture-server/config/claude-desktop']:
                status, headers, body = request(port, path)
                assert status == 200, (path, status)
                if path.startswith('/llms'): assert 'Fixture Server' in body and 's-maxage=21600' in headers.get('Cache-Control', ''), path
            status, headers, body = request(port, '/sitemap-servers-1.xml')
            assert status == 404 and headers.get('Cache-Control') == 'no-store'
            assert request(port, '/directory-root/home')[0] == 404
            print('PASS: legacy-schema nonempty runtime HTML/text/XML/config; ISR HIT without DB reads; cold outages uncached and explicit', flush=True)
        except Exception:
            print((Path(tmp) / 'runtime.log').read_text()[-8000:])
            raise
        finally:
            import signal
            os.killpg(server.pid, signal.SIGTERM)
            server.wait(timeout=10)
            db.shutdown()
