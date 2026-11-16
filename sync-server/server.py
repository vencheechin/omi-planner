#!/usr/bin/env python3
"""Planner Sync: your own Dropbox-style file sync server for Planner teams.

It keeps the team's shared files (each person's task file, attachments and who-is-viewing notes)
in a folder on the computer it runs on, signs people in with a team code, and tells every open
Planner the moment something changes. It also serves Planner itself, so everyone opens one link.

Run:  python3 sync-server/server.py            (port 8840, data in sync-server/data)
      python3 sync-server/server.py --port 9000 --data /path/to/data --host 0.0.0.0

Only the Python standard library is used: nothing to install.
"""
import argparse, hashlib, json, mimetypes, os, re, secrets, socket, sys, tempfile, threading, time, urllib.parse
from datetime import datetime, timezone
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))   # planner-app
MAX_UPLOAD = 50 * 1024 * 1024
ACCESS_TTL = 4 * 3600
LONGPOLL_MAX = 90

ap = argparse.ArgumentParser(description='Planner Sync server')
ap.add_argument('--port', type=int, default=int(os.environ.get('PORT', 8840)))
ap.add_argument('--host', default=os.environ.get('HOST', '0.0.0.0'))
ap.add_argument('--data', default=os.environ.get('PLANNER_SYNC_DATA', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')))
ap.add_argument('--app', default=APP_DIR, help='folder of the Planner app to serve at /')
args = ap.parse_args()

DATA = os.path.abspath(args.data)
FILES = os.path.join(DATA, 'files')
os.makedirs(FILES, exist_ok=True)
LOCK = threading.Lock()
CHANGED = threading.Condition()
STATE = {'change': 0}
ACCESS = {}   # access token -> (email, expires)


def load_json(name, default):
    try:
        with open(os.path.join(DATA, name)) as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def save_json(name, obj):
    fd, tmp = tempfile.mkstemp(dir=DATA)
    with os.fdopen(fd, 'w') as f:
        json.dump(obj, f, indent=1)
    os.replace(tmp, os.path.join(DATA, name))


# The team code: from PLANNER_TEAM_CODE, else made once and kept in data/team-code.txt.
CODE_FILE = os.path.join(DATA, 'team-code.txt')
TEAM_CODE = os.environ.get('PLANNER_TEAM_CODE', '').strip()
if not TEAM_CODE:
    try:
        TEAM_CODE = open(CODE_FILE).read().strip()
    except OSError:
        TEAM_CODE = '-'.join(secrets.token_hex(2).upper() for _ in range(3))
        with open(CODE_FILE, 'w') as f:
            f.write(TEAM_CODE + '\n')
DEVICES = load_json('devices.json', {})   # refresh token hash -> {email, created, seen}
STATE['change'] = load_json('state.json', {}).get('change', 0)


def th(token):
    return hashlib.sha256(token.encode()).hexdigest()


def bump():
    with CHANGED:
        STATE['change'] += 1
        CHANGED.notify_all()
    save_json('state.json', {'change': STATE['change']})


def safe_path(p):
    """'/Team/members/a.json' -> absolute path inside FILES, or None if it tries to leave it."""
    p = (p or '').replace('\\', '/').strip('/')
    parts = [x for x in p.split('/') if x]
    if any(x in ('.', '..') or x.startswith('.') for x in parts):
        return None
    full = os.path.abspath(os.path.join(FILES, *parts)) if parts else FILES
    return full if full == FILES or full.startswith(FILES + os.sep) else None


def display(full):
    rel = os.path.relpath(full, FILES).replace(os.sep, '/')
    return '' if rel == '.' else '/' + rel


def iso(ts):
    return datetime.fromtimestamp(ts, timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')


def meta(full):
    st = os.stat(full)
    name = os.path.basename(full)
    d = display(full)
    if os.path.isdir(full):
        return {'.tag': 'folder', 'name': name, 'path_display': d, 'path_lower': d.lower(), 'id': 'id:' + th(d)[:16]}
    return {'.tag': 'file', 'name': name, 'path_display': d, 'path_lower': d.lower(), 'id': 'id:' + th(d)[:16],
            'size': st.st_size, 'rev': format(st.st_mtime_ns, 'x'), 'server_modified': iso(st.st_mtime)}


class Handler(BaseHTTPRequestHandler):
    server_version = 'PlannerSync/1'

    def log_message(self, fmt, *a):
        if not str(a[1] if len(a) > 1 else '').startswith('2'):
            sys.stderr.write('%s %s\n' % (self.address_string(), fmt % a))

    def cors(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Authorization, Content-Type, Dropbox-API-Arg')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Expose-Headers', 'Dropbox-API-Result')

    def send_json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.cors()
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def err(self, summary, code=409):
        self.send_json({'error_summary': summary, 'error': {'.tag': summary.split('/')[0]}}, code)

    def do_OPTIONS(self):
        self.send_response(204)
        self.cors()
        self.end_headers()

    # ---------- Planner app and status page ----------
    def do_GET(self):
        path = urllib.parse.urlparse(self.path).path
        if path == '/_planner_sync':
            return self.send_json({'app': 'planner-sync', 'version': 1})
        if path == '/_status':
            if self.client_address[0] not in ('127.0.0.1', '::1'):
                return self.send_error(403, 'Open this page on the computer running the server')
            return self.status_page()
        rel = urllib.parse.unquote(path).lstrip('/') or 'index.html'
        full = os.path.abspath(os.path.join(args.app, rel))
        if (not full.startswith(os.path.abspath(args.app) + os.sep)) or any(x.startswith('.') for x in rel.split('/')) or 'sync-server' in rel.split('/')[:1]:
            return self.send_error(404)
        if os.path.isdir(full):
            full = os.path.join(full, 'index.html')
        if not os.path.isfile(full):
            return self.send_error(404)
        with open(full, 'rb') as f:
            body = f.read()
        self.send_response(200)
        self.send_header('Content-Type', mimetypes.guess_type(full)[0] or 'application/octet-stream')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-cache')
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    do_HEAD = do_GET

    def status_page(self):
        rows, now = [], time.time()
        for root, dirs, files in os.walk(FILES):
            dirs[:] = sorted(d for d in dirs if not d.startswith('.'))
            for n in sorted(files):
                full = os.path.join(root, n)
                st = os.stat(full)
                rows.append('<tr><td>%s</td><td>%s</td><td>%d min ago</td></tr>' % (display(full), f'{st.st_size:,} B', (now - st.st_mtime) // 60))
        viewers = []
        for root, _, files in os.walk(FILES):
            if os.path.basename(root) != 'presence':
                continue
            for n in files:
                try:
                    p = json.load(open(os.path.join(root, n)))
                except (OSError, ValueError):
                    continue
                if p.get('taskId') and now * 1000 - p.get('at', 0) < 90000:
                    viewers.append('<li>%s has a task open</li>' % (p.get('name') or p.get('email') or 'Someone'))
        html = ('<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>Planner Sync</title>'
                '<style>body{font:15px system-ui;margin:24px;max-width:900px}td{padding:3px 12px 3px 0}</style>'
                '<h1>Planner Sync</h1><p>%d device(s) signed in · %d file(s)</p><h2>Open now</h2><ul>%s</ul><h2>Files</h2><table>%s</table>'
                % (len(DEVICES), len(rows), ''.join(viewers) or '<li>Nobody</li>', ''.join(rows)))
        body = html.encode()
        self.send_response(200)
        self.send_header('Content-Type', 'text/html; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    # ---------- API (the same calls Planner makes to Dropbox) ----------
    def body(self):
        n = int(self.headers.get('Content-Length') or 0)
        if n > MAX_UPLOAD:
            raise ValueError('too_large')
        return self.rfile.read(n) if n else b''

    def who(self):
        auth = self.headers.get('Authorization') or ''
        tok = auth[7:] if auth.startswith('Bearer ') else ''
        hit = ACCESS.get(tok)
        if not hit or hit[1] < time.time():
            return None
        return hit[0]

    def do_POST(self):
        path = urllib.parse.urlparse(self.path).path
        try:
            raw = self.body()
        except ValueError:
            return self.err('payload_too_large/', 413)
        if path == '/oauth2/token':
            return self.token(raw)
        if path == '/2/files/list_folder/longpoll':
            return self.longpoll(raw)
        email = self.who()
        if not email:
            return self.err('invalid_access_token/', 401)
        try:
            j = json.loads(raw or b'null') if self.headers.get('Content-Type', '').startswith('application/json') else None
        except ValueError:
            return self.err('bad_request/', 400)
        try:
            arg = json.loads(self.headers.get('Dropbox-API-Arg') or 'null')
        except ValueError:
            return self.err('bad_request/', 400)
        route = path[len('/2/'):] if path.startswith('/2/') else ''
        if route == 'users/get_current_account':
            return self.send_json({'email': email, 'account_id': 'planner:' + th(email)[:12], 'name': {'display_name': email}})
        if route == 'files/list_folder/get_latest_cursor':
            return self.send_json({'cursor': str(STATE['change'])})
        if route in ('files/list_folder', 'files/list_folder/continue'):
            if route.endswith('continue'):
                return self.send_json({'entries': [], 'cursor': str(STATE['change']), 'has_more': False})
            full = safe_path(j.get('path'))
            if not full or not os.path.isdir(full):
                return self.err('path/not_found/')
            ents = [meta(os.path.join(full, n)) for n in sorted(os.listdir(full)) if not n.startswith('.')]
            return self.send_json({'entries': ents, 'cursor': str(STATE['change']), 'has_more': False})
        if route == 'files/get_metadata':
            full = safe_path(j.get('path'))
            if not full or not os.path.exists(full) or full == FILES:
                return self.err('path/not_found/')
            return self.send_json(meta(full))
        if route == 'files/create_folder_v2':
            full = safe_path(j.get('path'))
            if not full or full == FILES:
                return self.err('path/malformed_path/', 400)
            if os.path.exists(full):
                return self.err('path/conflict/folder/')
            os.makedirs(full)
            bump()
            return self.send_json({'metadata': meta(full)})
        if route == 'files/download':
            full = safe_path((arg or {}).get('path'))
            if not full or not os.path.isfile(full):
                return self.err('path/not_found/')
            with open(full, 'rb') as f:
                data = f.read()
            self.send_response(200)
            self.cors()
            self.send_header('Content-Type', 'application/octet-stream')
            self.send_header('Content-Length', str(len(data)))
            self.send_header('Dropbox-API-Result', json.dumps(meta(full)))
            self.end_headers()
            self.wfile.write(data)
            return
        if route == 'files/upload':
            full = safe_path((arg or {}).get('path'))
            if not full or full == FILES:
                return self.err('path/malformed_path/', 400)
            with LOCK:
                os.makedirs(os.path.dirname(full), exist_ok=True)
                fd, tmp = tempfile.mkstemp(dir=os.path.dirname(full), prefix='.up-')
                with os.fdopen(fd, 'wb') as f:
                    f.write(raw)
                os.replace(tmp, full)
            bump()
            return self.send_json(meta(full))
        return self.err('unknown_route/', 404)

    def token(self, raw):
        f = dict(urllib.parse.parse_qsl(raw.decode('utf-8', 'replace')))
        grant = f.get('grant_type')
        if grant == 'team_code':
            email = (f.get('email') or '').strip().lower()
            if not secrets.compare_digest((f.get('team_code') or '').strip().upper(), TEAM_CODE.upper()):
                time.sleep(1)   # slows down guessing
                return self.send_json({'error': 'invalid_grant', 'error_description': 'That team code isn’t right.'}, 400)
            if not re.match(r'^[^@\s]+@[^@\s]+$', email):
                return self.send_json({'error': 'invalid_request', 'error_description': 'Add your email in Settings first.'}, 400)
            refresh = secrets.token_urlsafe(32)
            with LOCK:
                DEVICES[th(refresh)] = {'email': email, 'created': int(time.time()), 'seen': int(time.time())}
                save_json('devices.json', DEVICES)
        elif grant == 'refresh_token':
            refresh = f.get('refresh_token') or ''
            dev = DEVICES.get(th(refresh))
            if not dev:
                return self.send_json({'error': 'invalid_grant', 'error_description': 'Sign in again with the team code.'}, 400)
            email = dev['email']
            dev['seen'] = int(time.time())
        else:
            return self.send_json({'error': 'unsupported_grant_type'}, 400)
        access = secrets.token_urlsafe(32)
        ACCESS[access] = (email, time.time() + ACCESS_TTL)
        out = {'access_token': access, 'expires_in': ACCESS_TTL, 'token_type': 'bearer', 'account_id': 'planner:' + th(email)[:12]}
        if grant == 'team_code':
            out['refresh_token'] = refresh
        return self.send_json(out)

    def longpoll(self, raw):
        try:
            j = json.loads(raw)
            cur = int(j.get('cursor'))
            wait = max(30, min(int(j.get('timeout', 30)), LONGPOLL_MAX))
        except (ValueError, TypeError):
            return self.err('reset/', 400)
        deadline = time.time() + wait
        with CHANGED:
            while STATE['change'] == cur and time.time() < deadline:
                CHANGED.wait(deadline - time.time())
            changed = STATE['change'] != cur
        return self.send_json({'changes': changed})


def lan_ip():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(('10.255.255.255', 1))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except OSError:
        return None


if __name__ == '__main__':
    srv = ThreadingHTTPServer((args.host, args.port), Handler)
    srv.daemon_threads = True
    ip = lan_ip()
    print('Planner Sync is running.')
    print(f'  On this computer:   http://127.0.0.1:{args.port}/')
    if ip and args.host in ('0.0.0.0', ''):
        print(f'  Colleagues (same Wi-Fi): http://{ip}:{args.port}/')
    print(f'  Team code:          {TEAM_CODE}')
    print(f'  Files are kept in:  {FILES}')
    print(f'  What is synced:     http://127.0.0.1:{args.port}/_status  (this computer only)')
    print('Keep this window open. Press Ctrl+C to stop.')
    sys.stdout.flush()
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
