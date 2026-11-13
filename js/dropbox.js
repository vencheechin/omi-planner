'use strict';
/* Team sync through Dropbox, talking to Dropbox directly over the internet (its HTTP API), the way
   the Dropbox app itself syncs. It does not depend on a synced folder on the computer, so it works
   on phones too, and it sidesteps the problems OneDrive's "Files On-Demand" folders cause for the
   browser (files that aren't downloaded yet, permission prompts, late uploads).

   It behaves like the folder that Team sync already uses (members/, files/, presence/), so the
   merge logic in team.js is the same for every way of syncing. Dropbox tells Planner the moment
   something in the team folder changes (a "long poll"), so teammates see changes within seconds.

   Sign-in uses Dropbox's standard PKCE flow: no passwords pass through Planner, and only a
   refresh token is kept in this browser. */

const DBX_LS_KEY = 'planner-dropbox-key';
const Dbx = {
  // window.PLANNER_DROPBOX = { appKey, apiBase?, contentBase?, notifyBase?, authBase? } in config.js.
  cfg() {
    const d = window.PLANNER_DROPBOX || {};
    let saved = '';
    try { saved = localStorage.getItem(lsKey(DBX_LS_KEY)) || ''; } catch { /* storage blocked */ }
    return {
      appKey: String(saved || d.appKey || '').trim(),
      api: d.apiBase || 'https://api.dropboxapi.com',
      content: d.contentBase || 'https://content.dropboxapi.com',
      notify: d.notifyBase || 'https://notify.dropboxapi.com',
      auth: d.authBase || 'https://www.dropbox.com',
    };
  },
  setAppKey(k) { try { localStorage.setItem(lsKey(DBX_LS_KEY), String(k || '').trim()); } catch { /* storage blocked */ } },
  configured() { return !!this.cfg().appKey; },
  /** Where Dropbox sends people back after sign-in. Empty when Planner was opened as a file. */
  redirectUri() { return location.protocol.startsWith('http') ? location.origin + location.pathname : ''; },

  // ---------- Sign-in (OAuth 2 with PKCE) ----------
  b64url(bytes) { return btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  async pkce() {
    const verifier = this.b64url(crypto.getRandomValues(new Uint8Array(48)));
    const challenge = this.b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
    return { verifier, challenge };
  },
  /** Starts sign-in. With a web address, Dropbox comes back here; opened as a file, people paste a code. */
  async signIn() {
    const c = this.cfg();
    const { verifier, challenge } = await this.pkce();
    const state = uid();
    const redirect = this.redirectUri();
    const q = new URLSearchParams({ client_id: c.appKey, response_type: 'code', code_challenge: challenge, code_challenge_method: 'S256', token_access_type: 'offline', state });
    if (redirect) q.set('redirect_uri', redirect);
    const url = `${c.auth}/oauth2/authorize?${q}`;
    if (redirect) {
      // Remember which link (profile) started sign-in, so the code is used by the same Planner.
      localStorage.setItem(`planner-dbx-pending:${state}`, JSON.stringify({ verifier, back: location.search + location.hash, at: Date.now() }));
      location.assign(url);
      return null;
    }
    window.open(url, '_blank', 'noopener');
    const code = await promptDlg('Connect Dropbox', 'Dropbox opened in a new tab. Choose Allow, then paste the code it shows here', '', 'Connect');
    if (!code) return null;
    return this.exchange(code.trim(), verifier, '');
  },
  /** Called at start-up: finishes a sign-in that Dropbox just sent back to this page. */
  async finishRedirect() {
    const q = new URLSearchParams(location.search);
    const code = q.get('code'), state = q.get('state');
    if (code && state) {
      const pending = JSON.parse(localStorage.getItem(`planner-dbx-pending:${state}`) || 'null');
      if (!pending) return null;
      localStorage.removeItem(`planner-dbx-pending:${state}`);
      // Go back to the link that started sign-in (it may be another profile) and finish there.
      sessionStorage.setItem('planner-dbx-code', JSON.stringify({ code, verifier: pending.verifier, redirect: this.redirectUri() }));
      const back = location.pathname + (pending.back || '');
      if (back !== location.pathname + location.search + location.hash) { location.replace(back); return 'leaving'; }
    }
    if (q.get('error') && q.get('state')) {
      localStorage.removeItem(`planner-dbx-pending:${q.get('state')}`);
      history.replaceState(null, '', location.pathname);
      toast('Dropbox sign-in was cancelled.', { error: true });
      return null;
    }
    const got = JSON.parse(sessionStorage.getItem('planner-dbx-code') || 'null');
    if (!got) return null;
    sessionStorage.removeItem('planner-dbx-code');
    return this.exchange(got.code, got.verifier, got.redirect);
  },
  async exchange(code, verifier, redirect) {
    const c = this.cfg();
    const body = new URLSearchParams({ code, grant_type: 'authorization_code', code_verifier: verifier, client_id: c.appKey });
    if (redirect) body.set('redirect_uri', redirect);
    const res = await fetch(`${c.api}/oauth2/token`, { method: 'POST', body });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.refresh_token) throw new Error(j.error_description || j.error || `Dropbox sign-in failed (${res.status})`);
    return { refresh: j.refresh_token, access: j.access_token, expires: Date.now() + (j.expires_in || 14400) * 1000, account: j.account_id || '' };
  },
};

/** An authorised connection to one person's Dropbox. */
class DbxClient {
  constructor(auth) { this.auth = auth; this.access = auth.access || ''; this.expires = auth.expires || 0; }
  async token() {
    if (this.access && Date.now() < this.expires - 60000) return this.access;
    const c = Dbx.cfg();
    const res = await fetch(`${c.api}/oauth2/token`, { method: 'POST', body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: this.auth.refresh, client_id: c.appKey }) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.access_token) {
      const e = new Error('Dropbox needs you to sign in again.');
      e.name = res.status === 400 || res.status === 401 ? 'NotAllowedError' : 'NetworkError';
      throw e;
    }
    this.access = j.access_token;
    this.expires = Date.now() + (j.expires_in || 14400) * 1000;
    return this.access;
  }
  /** Dropbox-API-Arg must be plain ASCII, so other characters (accents, Chinese names) are escaped. */
  static arg(o) { return JSON.stringify(o).replace(/[\u007f-￿]/g, (ch) => `\\u${ch.charCodeAt(0).toString(16).padStart(4, '0')}`); }
  async call(base, route, { json, arg, body, keepalive, retry = true } = {}) {
    const headers = { Authorization: `Bearer ${await this.token()}` };
    let payload;
    if (arg !== undefined) { headers['Dropbox-API-Arg'] = DbxClient.arg(arg); }
    if (json !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(json); }
    if (body !== undefined) { headers['Content-Type'] = 'application/octet-stream'; payload = body; }
    let res;
    try { res = await fetch(`${base}/2/${route}`, { method: 'POST', headers, body: payload, keepalive }); } catch (err) { const e = new Error('Offline · will sync when online'); e.name = 'NetworkError'; throw e; }
    if (res.status === 401 && retry) { this.access = ''; return this.call(base, route, { json, arg, body, keepalive, retry: false }); }
    if (res.status === 429 || res.status >= 500) {
      const wait = Number(res.headers.get('Retry-After')) || 2;
      if (retry) { await new Promise((r) => setTimeout(r, Math.min(wait, 10) * 1000)); return this.call(base, route, { json, arg, body, keepalive, retry: false }); }
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      let summary = text;
      try { summary = JSON.parse(text).error_summary || text; } catch { /* plain text */ }
      const e = new Error(summary || `Dropbox error ${res.status}`);
      e.status = res.status;
      e.summary = summary;
      if (res.status === 401 || res.status === 403) e.name = 'NotAllowedError';
      if (/not_found/.test(summary)) e.name = 'NotFoundError';
      throw e;
    }
    return res;
  }
  async rpc(route, json) { return (await this.call(Dbx.cfg().api, route, { json })).json(); }
  async list(path) {
    let r;
    try { r = await this.rpc('files/list_folder', { path, recursive: false, include_deleted: false }); } catch (err) { if (err.name === 'NotFoundError') return []; throw err; }
    const out = [...r.entries];
    while (r.has_more) { r = await this.rpc('files/list_folder/continue', { cursor: r.cursor }); out.push(...r.entries); }
    return out;
  }
  async meta(path) {
    try { return await this.rpc('files/get_metadata', { path }); } catch (err) { if (err.name === 'NotFoundError' || err.status === 409) return null; throw err; }
  }
  async download(path) { return (await this.call(Dbx.cfg().content, 'files/download', { arg: { path } })).blob(); }
  async upload(path, blob, { keepalive = false } = {}) {
    return (await this.call(Dbx.cfg().content, 'files/upload', { arg: { path, mode: 'overwrite', autorename: false, mute: true }, body: blob, keepalive })).json();
  }
  async createFolder(path) {
    try { return await this.rpc('files/create_folder_v2', { path, autorename: false }); } catch (err) { if (/conflict/.test(err.summary || '')) return null; throw err; }
  }
  async account() { return this.rpc('users/get_current_account', null); }
  async latestCursor(path) { return (await this.rpc('files/list_folder/get_latest_cursor', { path, recursive: true, include_deleted: true })).cursor; }
  /** Waits (up to `timeout` seconds) until something in the folder changes. No token needed. */
  async waitForChange(cursor, timeout = 90) {
    const res = await fetch(`${Dbx.cfg().notify}/2/files/list_folder/longpoll`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cursor, timeout }) });
    if (!res.ok) { const e = new Error(`Dropbox change watch ${res.status}`); e.status = res.status; throw e; }
    return res.json();
  }
}

/** The same small folder interface as the browser's folder API, backed by Dropbox. */
class DropboxDir {
  constructor(client, path, name) { this.client = client; this.path = path; this.name = name || path.split('/').pop() || 'Dropbox'; this.kind = 'directory'; this.virtual = 'dropbox'; }
  async getDirectoryHandle(n) { return new DropboxDir(this.client, `${this.path}/${n}`, n); }
  async getFileHandle(n, { create = false } = {}) {
    const p = `${this.path}/${n}`;
    if (!create) {
      const m = await this.client.meta(p);
      if (!m || m['.tag'] !== 'file') throw new DOMException(`${n} not found`, 'NotFoundError');
      return new DropboxFile(this.client, p, n, m);
    }
    return new DropboxFile(this.client, p, n, null);
  }
  async *entries() {
    for (const m of await this.client.list(this.path)) {
      yield [m.name, m['.tag'] === 'file' ? new DropboxFile(this.client, m.path_display || `${this.path}/${m.name}`, m.name, m) : new DropboxDir(this.client, m.path_display, m.name)];
    }
  }
  async queryPermission() { return 'granted'; }
  async requestPermission() { return 'granted'; }
}
class DropboxFile {
  constructor(client, path, name, meta) { this.client = client; this.path = path; this.name = name; this.meta = meta; this.kind = 'file'; }
  /** Size and version without downloading, so unchanged teammate files cost nothing. */
  peek() { return { lastModified: Date.parse(this.meta?.server_modified || 0) || 0, size: this.meta?.size || 0, rev: this.meta?.rev || '' }; }
  async getFile() {
    const blob = await this.client.download(this.path);
    return new File([blob], this.name, { lastModified: this.peek().lastModified || Date.now(), type: blob.type });
  }
  async createWritable({ keepalive = false } = {}) {
    const parts = [];
    return { write: async (d) => { parts.push(d); }, close: async () => { this.meta = await this.client.upload(this.path, new Blob(parts), { keepalive }); } };
  }
}

/** Keeps a long poll open on the team folder and runs a sync whenever Dropbox reports a change. */
const DbxWatch = {
  gen: 0,
  start(dir, onChange) {
    const gen = ++this.gen;
    (async () => {
      let cursor = null, fails = 0;
      while (gen === this.gen) {
        try {
          if (!navigator.onLine) { await new Promise((r) => setTimeout(r, 5000)); continue; }
          if (!cursor) cursor = await dir.client.latestCursor(dir.path);
          const r = await dir.client.waitForChange(cursor);
          fails = 0;
          if (gen !== this.gen) return;
          if (r.changes) { cursor = await dir.client.latestCursor(dir.path); onChange(); }
          if (r.backoff) await new Promise((res) => setTimeout(res, r.backoff * 1000));
        } catch (err) {
          cursor = err.status === 400 || err.status === 409 ? null : cursor;
          fails++;
          await new Promise((res) => setTimeout(res, Math.min(60, 2 ** fails) * 1000));
        }
      }
    })();
  },
  stop() { this.gen++; },
};
