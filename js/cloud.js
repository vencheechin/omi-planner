'use strict';
/* Cloud sync through Supabase, for every device including phones.

   Offline first: every change is saved on the device and marked "dirty". When online, dirty
   records are sent to the database, which merges them field by field (merge_records in
   cloud/setup.sql), then everything changed since the last sync is fetched and merged here
   with the same newest-field-wins rule. Nothing is lost while offline; it just waits.

   Where records live (row level security enforces this on the server):
     u:<your user id>   your private records: personal tasks and plans, people, preferences,
                        and your own time slots / boxes / colours for shared tasks
     t:<team id>        records shared with your team: tasks assigned between people, their
                        plans, and the people they mention

   No Supabase library is needed: sign-in (emailed 6-digit code) and data use plain fetch. */

const TASK_LOCAL_FIELDS = ['slotDate', 'slotStart', 'boxId', 'boxOrder', 'tbQueued', 'tbColor', 'myDay', 'box', 'reminders', 'remFired', 'myOrder', 'myBucketId'];
const PLAN_LOCAL_FIELDS = ['pinned', 'personal', 'fromPos', 'fromColor'];
const PERSON_FIELDS = ['name', 'email', 'color'];
const PREFS_FIELDS = ['timebox', 'personPlans', 'days', 'chat'];
const ALL_TASK_FIELDS = [...TASK_FIELDS, ...TASK_LOCAL_FIELDS];
const ALL_PLAN_FIELDS = [...PLAN_FIELDS, ...PLAN_LOCAL_FIELDS];
const KIND_ORDER = { person: 0, prefs: 1, plan: 2, planLocal: 3, task: 4, taskLocal: 5 };

const pickFields = (obj, fields) => {
  const out = { _v: {} };
  fields.forEach((f) => {
    out[f] = obj[f] === undefined ? null : clone(obj[f]);
    if (obj._v?.[f]) out._v[f] = obj._v[f];
  });
  return out;
};
/** The preferences that follow you between devices, as one record. */
const prefsRecord = () => ({ id: 'prefs', timebox: S.settings.timebox, personPlans: S.personPlans, days: S.days, chat: S.settings.chat });

/**
 * Notes field changes (with time and author) and marks changed records for upload. Runs after
 * trackChanges on every save, for all records, so cloud sync and the shared folder share stamps.
 */
function stampAll() {
  const sy = S.sync;
  const now = Date.now();
  sy.dirty = sy.dirty || {};
  const stamp = (id, obj, fields, holder) => {
    const sh = sy.shadow[id] || (sy.shadow[id] = {});
    holder._v = holder._v || {};
    let changed = false;
    for (const f of fields) {
      const h = fieldHash(obj[f]);
      if (sh[f] !== h) { sh[f] = h; holder._v[f] = [now, S.meId]; changed = true; }
    }
    if (changed) sy.dirty[id] = 1;
  };
  S.tasks.forEach((t) => stamp(t.id, t, ALL_TASK_FIELDS, t));
  S.plans.forEach((p) => stamp(p.id, p, ALL_PLAN_FIELDS, p));
  S.people.forEach((p) => stamp(p.id, p, PERSON_FIELDS, p));
  sy.prefs = sy.prefs || {};
  stamp('prefs', prefsRecord(), PREFS_FIELDS, sy.prefs);
  stPlans().forEach((p) => stamp(`st:${p.id}`, stRecord(p), stFields(p), p));
  stamp('org', orgRecord(), ['depts', 'admins', 'reportsTo'], org());
  const live = new Set([...S.tasks, ...S.plans, ...S.people].map((x) => x.id).concat('prefs', 'org', ...stPlans().map((p) => `st:${p.id}`)));
  for (const id of Object.keys(sy.shadow)) {
    if (!live.has(id)) { sy.tombstones[id] = [now, S.meId]; delete sy.shadow[id]; sy.dirty[id] = 1; }
  }
}

const Cloud = {
  session: null, team: null, state: 'off', error: '', busy: false, timer: null, pushTimer: null, waiting: 0,

  cfg() {
    const c = S.settings.cloud || {};
    const d = window.PLANNER_CLOUD || {};
    return { url: String(c.url || d.url || '').trim().replace(/\/+$/, ''), key: String(c.key || d.key || '').trim() };
  },
  configured() { const c = this.cfg(); return !!(c.url && c.key); },
  scopeUser() { return `u:${this.session.uid}`; },
  scopeTeam() { return this.team ? `t:${this.team.id}` : null; },

  async init() {
    if (!this.configured() || !Store.db) { this.setState(this.configured() ? 'signedOut' : 'off'); return; }
    try { this.session = await Store.tx('kv', 'readonly', (s) => s.get('cloudSession')); } catch { this.session = null; }
    if (!this.session) { this.setState('signedOut'); return; }
    this.start();
  },
  setState(state, error = '') { this.state = state; this.error = error; updateStatus(); },
  async saveSession(s) {
    this.session = s;
    await Store.tx('kv', 'readwrite', (st) => (s ? st.put(s, 'cloudSession') : st.delete('cloudSession')));
  },

  // ---------- HTTP ----------
  async req(path, { method = 'GET', body, headers = {}, auth = true, retry = true } = {}) {
    const { url, key } = this.cfg();
    if (auth) await this.ensureFresh();
    let res;
    try {
      res = await fetch(url + path, {
        method,
        headers: { apikey: key, 'Content-Type': 'application/json', ...(auth && this.session ? { Authorization: `Bearer ${this.session.access_token}` } : {}), ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch (err) {
      const e = new Error('offline');
      e.offline = true;
      throw e;
    }
    if (res.status === 401 && auth && retry) { await this.refresh(); return this.req(path, { method, body, headers, auth, retry: false }); }
    const text = await res.text();
    const data = text ? (() => { try { return JSON.parse(text); } catch { return text; } })() : null;
    if (!res.ok) throw new Error(data?.msg || data?.message || data?.error_description || data?.error || `${res.status} ${res.statusText}`);
    return data;
  },
  async ensureFresh() {
    if (this.session && this.session.expires_at - 60 < Date.now() / 1000) await this.refresh();
  },
  async refresh() {
    if (!this.session) throw new Error('Not signed in');
    try {
      const s = await this.req('/auth/v1/token?grant_type=refresh_token', { method: 'POST', auth: false, body: { refresh_token: this.session.refresh_token } });
      await this.saveSession(this.toSession(s));
    } catch (err) {
      if (err.offline) throw err;
      await this.saveSession(null);
      this.setState('signedOut', 'Your sign-in expired. Sign in again to keep syncing.');
      throw err;
    }
  },
  toSession(s) {
    return { access_token: s.access_token, refresh_token: s.refresh_token, expires_at: s.expires_at || Math.floor(Date.now() / 1000) + (s.expires_in || 3600), uid: s.user.id, email: String(s.user.email || '').toLowerCase() };
  },

  // ---------- Sign-in ----------
  async sendCode(email) {
    await this.req('/auth/v1/otp', { method: 'POST', auth: false, body: { email: email.trim().toLowerCase(), create_user: true } });
  },
  async verifyCode(email, code) {
    const s = await this.req('/auth/v1/verify', { method: 'POST', auth: false, body: { type: 'email', email: email.trim().toLowerCase(), token: code.trim() } });
    await this.saveSession(this.toSession(s));
    adoptEmailIds(this.session.email);
    // An account that already has data in the cloud: ask before mixing in this device's plans.
    const existing = await this.req(`/rest/v1/records?select=id&scope=eq.${encodeURIComponent(this.scopeUser())}&limit=1`);
    if (existing?.length && !S.sync.cloud?.since) {
      const choice = await choiceDlg('This account already has plans', '<p>Your account already has plans and tasks in the cloud, probably from another device.</p>', [
        { v: 'cloud', label: 'Use the cloud copy here', primary: true },
        { v: 'merge', label: 'Combine with this device' },
      ]);
      if (choice === 'cloud') replaceWithCloud(this.session.email);
    }
    S.sync.connectedAt = S.sync.connectedAt || Date.now();
    commit();
    this.start();
  },
  async signOut() {
    clearInterval(this.timer);
    await this.saveSession(null);
    this.team = null;
    this.setState('signedOut');
  },

  // ---------- Team ----------
  async loadTeam() {
    const me = this.session.email;
    const mine = await this.req(`/rest/v1/team_members?select=team_id&email=eq.${encodeURIComponent(me)}`);
    if (!mine?.length) { this.team = null; return; }
    const id = (S.sync.cloud?.teamId && mine.some((m) => m.team_id === S.sync.cloud.teamId)) ? S.sync.cloud.teamId : mine[0].team_id;
    const [team] = await this.req(`/rest/v1/teams?select=id,name,created_by&id=eq.${id}`) || [];
    // Roles need the latest setup.sql; before that, only the team's creator is an admin.
    let members;
    try { members = await this.req(`/rest/v1/team_members?select=email,role&team_id=eq.${id}&order=email`) || []; } catch { members = await this.req(`/rest/v1/team_members?select=email&team_id=eq.${id}&order=email`) || []; }
    const was = this.team?.id;
    const admins = members.filter((m) => m.role === 'admin').map((m) => m.email);
    if (team?.created_by === this.session.uid && !admins.includes(me)) admins.push(me);
    this.team = { id, name: team?.name || 'Team', members: members.map((m) => m.email), admins, creator: team?.created_by || null };
    S.sync.cloud = { ...(S.sync.cloud || {}), teamId: id };
    // Teammates become people you can assign to, by email.
    this.team.members.forEach((email) => { if (email !== me && !S.people.some((p) => p.email === email)) ensurePerson(nameFromEmail(email), email); });
    if (was !== id) markSharedDirty();
  },
  async createTeam(name) {
    const [team] = await this.req('/rest/v1/teams', { method: 'POST', body: { name }, headers: { Prefer: 'return=representation' } });
    await this.req('/rest/v1/team_members', { method: 'POST', body: { team_id: team.id, email: this.session.email, role: 'admin' }, headers: { Prefer: 'return=minimal' } });
    await this.loadTeam();
  },
  async setRole(email, role) {
    if (!this.team || !isAdmin()) throw new Error('Only admins can change who is an admin.');
    await this.req(`/rest/v1/team_members?team_id=eq.${this.team.id}&email=eq.${encodeURIComponent(email)}`, { method: 'PATCH', body: { role }, headers: { Prefer: 'return=minimal' } });
    await this.loadTeam();
  },
  /** Sends deletions and recalls waiting on this device to the message log in the cloud. */
  async flushLog() {
    const queue = S.sync.logQueue || [];
    if (!this.session || !queue.length || this.flushing) return;
    this.flushing = true;
    try {
      const rows = queue.map((e) => {
        const team = e.scope === 'team' && this.team ? this.team.id : null;
        return {
          id: e.id, team_id: team, scope: team ? `t:${team}` : this.scopeUser(), task_id: e.taskId, task_title: e.taskTitle || '', message_id: e.messageId,
          action: e.action, by_name: e.byName || '', author: e.author || '', author_name: e.authorName || '', message_text: e.text || '', files: e.files || [],
          message_at: e.messageAt ? new Date(e.messageAt).toISOString() : null, logged_at: new Date(e.at).toISOString(),
        };
      });
      await this.req('/rest/v1/message_log', { method: 'POST', body: rows, headers: { Prefer: 'return=minimal,resolution=ignore-duplicates' } });
      const sent = new Set(queue.map((e) => e.id));
      S.sync.logQueue = (S.sync.logQueue || []).filter((e) => !sent.has(e.id));
      Store.save();
    } catch { /* kept for the next sync (or until setup.sql has the message_log table) */ } finally { this.flushing = false; }
  },
  /** Sends this person's button counts (one row per button). */
  async flushUsage() {
    const u = S.usage;
    if (!this.session || !u?.dirty) return;
    const rows = Object.entries(u.counts).map(([action, c]) => ({ email: this.session.email, team_id: this.team?.id || null, action, uses: c.n, first_used: new Date(c.first).toISOString(), last_used: new Date(c.last || c.first).toISOString() }));
    try {
      await this.req('/rest/v1/button_usage?on_conflict=email,action', { method: 'POST', body: rows, headers: { Prefer: 'return=minimal,resolution=merge-duplicates' } });
      u.dirty = false;
    } catch { /* tried again next sync */ }
  },
  async readUsage() {
    const rows = await this.req(`/rest/v1/button_usage?select=action,uses,first_used,last_used&team_id=eq.${this.team.id}`) || [];
    const counts = {};
    let since = Date.now();
    for (const r of rows) {
      const c = (counts[r.action] = counts[r.action] || { n: 0, first: Date.now(), last: 0 });
      c.n += r.uses;
      c.first = Math.min(c.first, Date.parse(r.first_used));
      c.last = Math.max(c.last, Date.parse(r.last_used));
      since = Math.min(since, c.first);
    }
    return { counts, since };
  },
  async readLog() {
    const rows = await this.req(`/rest/v1/message_log?select=*&team_id=eq.${this.team.id}&order=logged_at.desc&limit=2000`) || [];
    return rows.map((r) => ({
      id: r.id, at: Date.parse(r.logged_at), action: r.action, by: r.by_email, byName: r.by_name || r.by_email, taskId: r.task_id, taskTitle: r.task_title,
      messageId: r.message_id, author: r.author, authorName: r.author_name, text: r.message_text, files: r.files || [], messageAt: r.message_at ? Date.parse(r.message_at) : null,
    }));
  },
  async invite(email) {
    email = email.trim().toLowerCase();
    await this.req('/rest/v1/team_members', { method: 'POST', body: { team_id: this.team.id, email }, headers: { Prefer: 'return=minimal' } });
    if (!S.people.some((p) => p.email === email)) ensurePerson(nameFromEmail(email), email);
    await this.loadTeam();
    commit();
  },
  async removeMember(email) {
    await this.req(`/rest/v1/team_members?team_id=eq.${this.team.id}&email=eq.${encodeURIComponent(email)}`, { method: 'DELETE' });
    await this.loadTeam();
  },

  // ---------- Sync ----------
  start() {
    clearInterval(this.timer);
    this.setState('ok');
    this.sync();
    this.timer = setInterval(() => { if (document.visibilityState === 'visible') this.sync(); }, 15000);
  },
  schedule() {
    if (!this.session || this.busy) return;
    clearTimeout(this.pushTimer);
    this.pushTimer = setTimeout(() => this.sync(), 1200);
  },
  async sync() {
    if (!this.session || this.busy) return;
    this.busy = true;
    try {
      await this.loadTeam();
      await this.flushLog();
      await this.flushUsage();
      // A device's first sync reads the cloud before writing, and lets your saved profile and
      // preferences win over a fresh install's defaults, which would otherwise look newer.
      const first = !S.sync.cloud?.since;
      if (first) await this.pull({ adoptMine: true });
      await this.push();
      const changed = await this.pull() || first;
      S.sync.cloud = { ...(S.sync.cloud || {}), lastSync: Date.now() };
      await Store.flush();
      if (changed && !document.activeElement?.closest?.('dialog, .pop')) render(); else { renderSidebar(); updateBell(); }
      this.setState('ok');
    } catch (err) {
      if (err.offline) this.setState('offline');
      else if (this.state !== 'signedOut') { console.error('Cloud sync failed', err); this.setState('error', err.message); }
    } finally {
      this.busy = false;
      this.waiting = Object.keys(S.sync.dirty || {}).length;
      updateStatus();
    }
  },
  /** Rows to upload for one dirty record id. */
  rowsFor(id) {
    const user = this.scopeUser();
    const team = this.scopeTeam();
    const meta = (S.sync.cloudMeta = S.sync.cloudMeta || {});
    if (id === 'org') return [{ scope: team || user, id, kind: 'org', data: orgWire() }];
    if (id.startsWith('st:')) {
      const p = stPlans().find((x) => x.id === id.slice(3));
      // With a team, each plan lives in its own scope that only the people allowed can read.
      return p ? [{ scope: team ? `s:${p.id}` : user, id, kind: 'stplan', data: stWire(p) }] : [];
    }
    if (id === 'prefs') return [{ scope: user, id, kind: 'prefs', data: { ...pickFields(prefsRecord(), PREFS_FIELDS), _v: { ...(S.sync.prefs?._v || {}) } } }];
    const t = taskById(id);
    if (t) {
      if (t.shared && team) {
        meta[id] = team;
        return [
          { scope: team, id, kind: 'task', data: { ...pickFields(t, TASK_FIELDS), comments: clone(t.comments), history: clone(t.history) } },
          { scope: user, id: `tl:${id}`, kind: 'taskLocal', data: pickFields(t, TASK_LOCAL_FIELDS) },
        ];
      }
      meta[id] = user;
      return [{ scope: user, id, kind: 'task', data: { ...pickFields(t, ALL_TASK_FIELDS), comments: clone(t.comments), history: clone(t.history) } }];
    }
    const p = planById(id);
    if (p) {
      if (p.shared && team) {
        meta[id] = team;
        return [{ scope: team, id, kind: 'plan', data: pickFields(p, PLAN_FIELDS) }, { scope: user, id: `pl:${id}`, kind: 'planLocal', data: pickFields(p, PLAN_LOCAL_FIELDS) }];
      }
      meta[id] = user;
      return [{ scope: user, id, kind: 'plan', data: pickFields(p, ALL_PLAN_FIELDS) }];
    }
    const who = person(id);
    if (who) {
      const scope = team && who.email && (who.id === S.meId || this.team.members.includes(who.email) || sharedPeople().has(who.id)) ? team : user;
      meta[id] = scope;
      return [{ scope, id, kind: 'person', data: pickFields(who, PERSON_FIELDS) }];
    }
    const stamp = S.sync.tombstones[id];
    if (stamp) return [{ scope: meta[id] || user, id, kind: 'deleted', data: { _v: { _deleted: stamp } } }];
    return [];
  },
  /** Tells the server who may read a plan (admins replace the list; an owner registers a new plan). */
  async syncAccess(p) {
    if (!this.team) return;
    const scope = `s:${p.id}`;
    const emails = [...new Set(stAudience(p).map((id) => person(id)?.email).filter(Boolean).concat(this.session.email))];
    if (isAdmin()) await this.req(`/rest/v1/st_access?scope=eq.${encodeURIComponent(scope)}`, { method: 'DELETE' });
    const rows = (isAdmin() ? emails : [this.session.email]).map((email) => ({ team_id: this.team.id, scope, email }));
    await this.req('/rest/v1/st_access', { method: 'POST', body: rows, headers: { Prefer: 'return=minimal,resolution=ignore-duplicates' } });
  },
  async push() {
    const ids = Object.keys(S.sync.dirty || {});
    if (!ids.length) return;
    for (const id of ids.filter((x) => x.startsWith('st:'))) {
      const p = stPlans().find((x) => x.id === id.slice(3));
      if (p && !(S.sync.stAccess || {})[id + ':' + stAudience(p).join(',')]) {
        try { await this.syncAccess(p); S.sync.stAccess = { ...(S.sync.stAccess || {}), [id + ':' + stAudience(p).join(',')]: 1 }; } catch { /* tried again next sync */ }
      }
    }
    // S-Team Plans go one at a time: if the server refuses one (no access yet, or an older setup.sql),
    // it waits for the next sync and everything else still goes up.
    const plans = ids.filter((x) => x.startsWith('st:'));
    const rest = ids.filter((x) => !x.startsWith('st:'));
    for (let i = 0; i < rest.length; i += 200) {
      const batch = rest.slice(i, i + 200);
      const rows = batch.flatMap((id) => this.rowsFor(id));
      if (rows.length) await this.req('/rest/v1/rpc/merge_records', { method: 'POST', body: { rows } });
      batch.forEach((id) => { delete S.sync.dirty[id]; });
    }
    let refused = 0;
    for (const id of plans) {
      const rows = this.rowsFor(id);
      try {
        if (rows.length) await this.req('/rest/v1/rpc/merge_records', { method: 'POST', body: { rows } });
        delete S.sync.dirty[id];
      } catch { refused++; }
    }
    if (refused) this.planError = `${refused} S-Team Plan${refused === 1 ? '' : 's'} not synced yet: the server needs the latest setup.sql, or access for this plan.`;
    else this.planError = '';
    await Store.flush();
  },
  async pull({ adoptMine = false } = {}) {
    const cloud = (S.sync.cloud = S.sync.cloud || {});
    // Re-read a minute before the last row seen, so a row committed late is never skipped; merging is idempotent.
    const since = cloud.since ? new Date(new Date(cloud.since).getTime() - 60000).toISOString() : '1970-01-01T00:00:00Z';
    let rows = [];
    for (let page = 0; page < 50; page++) {
      const got = await this.req(`/rest/v1/records?select=scope,id,kind,data,updated_at&updated_at=gt.${encodeURIComponent(since)}&order=updated_at.asc,id.asc&limit=1000&offset=${page * 1000}`);
      rows = rows.concat(got || []);
      if (!got || got.length < 1000) break;
    }
    rows = rows.concat(cloud.pending || []);
    if (!rows.length) return false;
    const before = JSON.stringify([S.people, S.plans, S.tasks, S.personPlans, S.days, S.settings.timebox]);
    const notices = [];
    const pending = [];
    rows.sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9));
    for (const row of rows) {
      if (applyCloudRow(row, notices, adoptMine) === 'pending') pending.push(row);
    }
    cloud.pending = pending.slice(-500);
    const newest = rows.reduce((m, r) => (r.updated_at && r.updated_at > m ? r.updated_at : m), cloud.since || '');
    if (newest) cloud.since = newest;
    S = normalizeState(S);
    if (!S.plans.some((p) => p.personal)) ensurePersonalPlan();
    notices.forEach(notify);
    return JSON.stringify([S.people, S.plans, S.tasks, S.personPlans, S.days, S.settings.timebox]) !== before;
  },

  statusText() {
    if (!this.configured() || this.state === 'off') return null;
    if (this.state === 'signedOut') return { text: 'Cloud: sign in to sync', cls: 'error', act: 'openSettings' };
    const waiting = Object.keys(S.sync.dirty || {}).length;
    if (this.state === 'offline' || !navigator.onLine) return { text: waiting ? `Offline · ${waiting} change${waiting === 1 ? '' : 's'} waiting to sync` : 'Offline · saved, will sync', cls: 'offline', act: 'openSettings' };
    if (this.state === 'error') return { text: 'Cloud sync problem · retrying', cls: 'error', act: 'openSettings' };
    const last = S.sync.cloud?.lastSync;
    const ago = last ? Math.round((Date.now() - last) / 60000) : null;
    return { text: `Synced ${ago === null ? 'not yet' : ago < 1 ? 'just now' : `${ago} min ago`}`, cls: '', act: 'openSettings' };
  },
};

/** People mentioned by shared tasks and plans: they need to be visible to the team. */
function sharedPeople() {
  const ids = new Set();
  S.tasks.filter((t) => t.shared).forEach((t) => [...t.assignees, t.assignedBy, ...t.history.flatMap((e) => [e.by, e.to]), ...t.comments.map((c) => c.author)].forEach((id) => id && ids.add(id)));
  S.plans.filter((p) => p.shared).forEach((p) => p.members.forEach((id) => ids.add(id)));
  return ids;
}
function markSharedDirty() {
  S.sync.dirty = S.sync.dirty || {};
  [...S.tasks.filter((t) => t.shared), ...S.plans.filter((p) => p.shared), ...S.people].forEach((x) => { S.sync.dirty[x.id] = 1; });
  S.sync.dirty.org = 1;
  stTouchAll();
}
const nameFromEmail = (email) => email.split('@')[0].split(/[._-]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') || email;

/**
 * Gives everyone with an email the id "e:<email>", so the same person has the same id on every
 * device and in every teammate's Planner. Runs when you sign in.
 */
function adoptEmailIds(myEmail) {
  const me = person(S.meId);
  if (myEmail && me) me.email = myEmail;
  for (const p of [...S.people]) {
    if (!p.email) continue;
    const id = `e:${p.email}`;
    if (p.id === id) continue;
    const dupe = S.people.find((x) => x.id === id);
    rewritePerson(S, p.id, id);
    if (S.meId === p.id) S.meId = id;
    if (dupe) S.people = S.people.filter((x) => x !== p); else p.id = id;
  }
}
/** Empties this device so the account's cloud copy can replace it. */
function replaceWithCloud(email) {
  const local = person(S.meId);
  const me = { id: `e:${email}`, name: local && local.name !== 'Me' ? local.name : nameFromEmail(email), email, color: local?.color || PERSON_COLORS[0] };
  const keep = { theme: S.settings.theme, cloud: S.settings.cloud };
  S = normalizeState({ v: 1, people: [me], meId: me.id, plans: [], tasks: [], settings: { ...keep }, days: {}, personPlans: [], inbox: [] });
  S.sync.ready = true;
  S.sync.cloud = { since: null };
}
function ensurePersonalPlan() {
  const plan = makePlan('Personal tasks', PLAN_COLORS[2], { personal: true });
  S.plans.push(plan);
}

/** Merges one row from the cloud into S. Returns 'pending' when it depends on a row not here yet. */
function applyCloudRow(row, notices, adoptMine = false) {
  const d = row.data || {};
  const v = d._v || {};
  const team = String(row.scope).startsWith('t:');
  const sh = (id) => S.sync.shadow[id] || (S.sync.shadow[id] = {});
  // On a device's first sync, your own profile and preferences come from the cloud regardless of age.
  const force = adoptMine && (row.kind === 'prefs' || (row.kind === 'person' && row.id === S.meId));
  const apply = (obj, fields, shadowId = obj.id) => {
    let changed = false;
    obj._v = obj._v || {};
    for (const f of fields) {
      const rv = v[f];
      if (!rv || (!force && !newer(rv, obj._v[f]))) continue;
      if (fieldHash(d[f]) !== fieldHash(obj[f])) { obj[f] = clone(d[f]); changed = true; }
      obj._v[f] = rv;
      sh(shadowId)[f] = fieldHash(obj[f]);
    }
    return changed;
  };
  // A freshly created object counts its starting values as already seen, so they aren't sent back as new edits.
  const settle = (obj, fields) => { fields.forEach((f) => { if (!(f in (obj._v || {}))) sh(obj.id)[f] = fieldHash(obj[f]); }); };

  if (v._deleted) {
    const target = taskById(row.id) || planById(row.id) || person(row.id);
    if (target && v._deleted[0] >= maxStamp({ _v: Object.fromEntries(Object.entries(target._v || {}).filter(([k]) => k !== '_deleted')) })) {
      S.tasks = S.tasks.filter((t) => t.id !== row.id && t.planId !== row.id);
      S.plans = S.plans.filter((p) => p.id !== row.id);
      if (row.id !== S.meId) S.people = S.people.filter((p) => p.id !== row.id);
      delete S.sync.shadow[row.id];
    }
    S.sync.tombstones[row.id] = v._deleted;
    return true;
  }
  if (S.sync.tombstones[row.id] && S.sync.tombstones[row.id][0] >= maxStamp(d)) return false;

  switch (row.kind) {
    case 'person': {
      let p = person(row.id);
      if (!p) {
        if (row.id === S.meId) return false;
        p = { id: row.id, name: d.name || 'Teammate', email: d.email || '', color: d.color || PERSON_COLORS[S.people.length % PERSON_COLORS.length] };
        S.people.push(p);
      }
      return apply(p, PERSON_FIELDS);
    }
    case 'stplan': return applyStPlan(String(row.id).slice(3), d);
    case 'org': return applyOrg(d);
    case 'prefs': {
      const holder = (S.sync.prefs = S.sync.prefs || {});
      holder._v = holder._v || {};
      let changed = false;
      for (const f of PREFS_FIELDS) {
        const rv = v[f];
        if (!rv || (!force && !newer(rv, holder._v[f]))) continue;
        if (f === 'timebox') S.settings.timebox = normalizeTimebox(clone(d.timebox));
        else if (f === 'personPlans') S.personPlans = Array.isArray(d.personPlans) ? clone(d.personPlans) : S.personPlans;
        else if (f === 'days') S.days = d.days && typeof d.days === 'object' ? clone(d.days) : S.days;
        else if (f === 'chat') S.settings.chat = normalizeChatPrefs(clone(d.chat));
        holder._v[f] = rv;
        sh('prefs')[f] = fieldHash(prefsRecord()[f]);
        changed = true;
      }
      return changed;
    }
    case 'plan': {
      let p = planById(row.id);
      const fresh = !p;
      if (fresh) {
        p = { id: row.id, name: 'Plan', color: PLAN_COLORS[0], pinned: false, created: Date.now(), lastOpened: 0, labels: Array(LABELS.length).fill(''), buckets: [{ id: uid(), name: 'To do' }], members: [S.meId], personal: false, shared: team, owner: null, labelOrder: null };
        S.plans.push(p);
      }
      const changed = apply(p, team ? PLAN_FIELDS : ALL_PLAN_FIELDS);
      if (fresh) settle(p, ALL_PLAN_FIELDS);
      if (team) p.shared = true;
      return changed || fresh;
    }
    case 'planLocal': {
      const p = planById(row.id.slice(3));
      return p ? apply(p, PLAN_LOCAL_FIELDS) : 'pending';
    }
    case 'task': {
      let t = taskById(row.id);
      const fresh = !t;
      if (fresh) {
        if (!planById(d.planId)) return 'pending';
        t = makeTask({ id: row.id, planId: d.planId, shared: team });
        S.tasks.push(t);
      }
      const known = new Set([...t.history, ...t.comments].map((x) => x.id));
      let changed = apply(t, team ? TASK_FIELDS : ALL_TASK_FIELDS);
      for (const f of LIST_FIELDS) {
        const have = new Map(t[f].map((x) => [x.id, x]));
        for (const x of d[f] || []) {
          if (!x || !x.id) continue;
          const mine = have.get(x.id);
          if (!mine) { t[f].push(clone(x)); changed = true; } else if (x.deleted && !mine.deleted) { mine.deleted = true; changed = true; }
        }
        t[f].sort((a, b) => a.at - b.at);
        sh(t.id)[f] = fieldHash(t[f]);
      }
      if (fresh) settle(t, ALL_TASK_FIELDS);
      if (team) t.shared = true;
      S.sync.seenAssignees[t.id] = [...t.assignees];
      notices.push(...newEvents(t, fresh ? new Set() : known));
      return changed || fresh;
    }
    case 'taskLocal': {
      const t = taskById(row.id.slice(3));
      return t ? apply(t, TASK_LOCAL_FIELDS) : 'pending';
    }
    default:
      return false;
  }
}

// ---------- Settings ----------
function cloudSettingsHTML() {
  const c = Cloud.cfg();
  const s = Cloud.session;
  if (!Cloud.configured()) {
    return `
      <div class="task-fields two">
        <label class="field"><span>Project URL</span><input data-change="cloudCfg" data-k="url" value="${esc(c.url)}" placeholder="https://xxxx.supabase.co" autocomplete="off"></label>
        <label class="field"><span>Anon (public) key</span><input data-change="cloudCfg" data-k="key" value="${esc(c.key)}" placeholder="eyJ…" autocomplete="off"></label>
      </div>`;
  }
  if (!s) {
    return `
      <form class="row" data-submit="cloudSendCode"><input name="email" type="email" required placeholder="you@company.com" value="${esc(ui.cloudEmail || person(S.meId)?.email || '')}" aria-label="Email" style="flex:1"><button class="btn primary sm">Email me a code</button></form>
      ${ui.cloudEmail ? `<form class="row" data-submit="cloudVerify"><input name="code" inputmode="numeric" autocomplete="one-time-code" required placeholder="6-digit code" aria-label="Code" style="flex:1"><button class="btn primary sm">Sign in</button></form><p class="muted small">Code sent to ${esc(ui.cloudEmail)}.</p>` : ''}
      ${Cloud.error ? `<p class="danger-text small">${esc(Cloud.error)}</p>` : ''}
      <button class="btn ghost sm" data-act="cloudForget">Change project</button>`;
  }
  const t = Cloud.team;
  const waiting = Object.keys(S.sync.dirty || {}).length;
  return `<p class="small">Signed in as <b>${esc(s.email)}</b> · ${esc(Cloud.statusText()?.text || '')}${waiting ? ` · ${waiting} waiting` : ''}${Cloud.error ? `<br><span class="danger-text">${esc(Cloud.error)}</span>` : ''}${Cloud.planError ? `<br><span class="danger-text">${esc(Cloud.planError)}</span>` : ''}</p>
    ${t ? `<p class="small">Team: <b>${esc(t.name)}</b></p>
      <ul class="people-list">${t.members.map((m) => {
        const admin = (t.admins || []).includes(m);
        return `<li><span class="muted">${esc(m)}</span>${admin ? '<small class="role-tag">Admin</small>' : ''}${m === s.email ? '<small class="muted">you</small>' : ''}
          ${isAdmin() && m !== s.email ? `<button class="btn ghost xs" data-act="cloudSetRole" data-email="${esc(m)}" data-role="${admin ? 'member' : 'admin'}">${admin ? 'Remove admin' : 'Make admin'}</button><button class="icon-btn" data-act="cloudRemoveMember" data-email="${esc(m)}" aria-label="Remove ${esc(m)} from the team">${icon('close', 13)}</button>` : ''}</li>`;
      }).join('')}</ul>
      
      <form class="row" data-submit="cloudInvite"><input name="email" type="email" required placeholder="colleague@company.com" aria-label="Colleague's email" style="flex:1"><button class="btn ghost sm">${icon('plus', 14)} Add to team</button></form>
      `
    : `<form class="row" data-submit="cloudCreateTeam"><input name="name" required placeholder="Team name, e.g. OMI" aria-label="Team name" style="flex:1"><button class="btn primary sm">Create team</button></form>
      `}
    <div class="row"><button class="btn ghost sm" data-act="cloudSyncNow">Sync now</button><button class="btn ghost sm" data-act="cloudSignOut">Sign out</button></div>`;
}
