'use strict';
/* A shared folder that lives inside this browser, for trying Planner as two people on one phone
   or computer (for example Ven's link and Ray's link in two Safari tabs). It behaves like the
   OneDrive/Dropbox team folder: each person writes their shared tasks to it and reads the other's.
   It is only for testing on one device; real teams use cloud sync. */

const DeviceFolder = {
  db: null,
  open() {
    if (this.db) return Promise.resolve(this.db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('planner-device-folder', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('files');
      req.onsuccess = () => { this.db = req.result; resolve(this.db); };
      req.onerror = () => reject(req.error);
    });
  },
  async tx(mode, fn) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const t = db.transaction('files', mode);
      const r = fn(t.objectStore('files'));
      t.oncomplete = () => resolve(r && r.result);
      t.onerror = t.onabort = () => reject(t.error);
    });
  },
  get(path) { return this.tx('readonly', (s) => s.get(path)); },
  put(path, blob) { return this.tx('readwrite', (s) => s.put({ blob, at: Date.now() }, path)); },
  keys() { return this.tx('readonly', (s) => s.getAllKeys()); },
};

/** The small part of the browser's folder API that the team sync uses. */
class DeviceDir {
  constructor(path = '', name = 'Test folder on this device') { this.path = path; this.name = name; this.kind = 'directory'; this.virtual = true; }
  async getDirectoryHandle(n) { return new DeviceDir(`${this.path}${n}/`, n); }
  async getFileHandle(n, { create = false } = {}) {
    const p = this.path + n;
    if (!(await DeviceFolder.get(p))) {
      if (!create) throw new DOMException(`${n} not found`, 'NotFoundError');
      await DeviceFolder.put(p, new Blob([]));
    }
    return new DeviceFile(p, n);
  }
  async *entries() {
    for (const p of await DeviceFolder.keys()) {
      const rest = String(p).slice(this.path.length);
      if (!String(p).startsWith(this.path) || !rest || rest.includes('/')) continue;
      yield [rest, new DeviceFile(String(p), rest)];
    }
  }
  async queryPermission() { return 'granted'; }
  async requestPermission() { return 'granted'; }
}
class DeviceFile {
  constructor(path, name) { this.path = path; this.name = name; this.kind = 'file'; }
  async getFile() {
    const r = await DeviceFolder.get(this.path);
    if (!r) throw new DOMException(`${this.name} not found`, 'NotFoundError');
    return new File([r.blob], this.name, { lastModified: r.at, type: r.blob.type });
  }
  async createWritable() {
    const parts = [];
    return { write: async (d) => { parts.push(d); }, close: async () => { await DeviceFolder.put(this.path, new Blob(parts)); } };
  }
}
