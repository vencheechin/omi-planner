'use strict';
/* Keeps a copy of the app so it starts with no network. Bump VERSION when files are added or removed. */
const VERSION = 'planner-v110';
const SHELL = [
  './', 'index.html', 'css/app.css', 'js/core.js', 'js/views.js', 'js/task.js', 'js/team.js', 'js/timebox.js', 'js/config.js', 'js/cloud.js', 'js/import.js', 'js/chat.js', 'js/styles.js', 'js/devicefolder.js', 'js/usage.js', 'js/reminders.js', 'js/brandplan.js', 'js/admin.js', 'js/app.js',
  'manifest.webmanifest', 'icons/icon.svg', 'icons/omi-logo.svg', 'icons/icon-180.png', 'icons/icon-192.png', 'icons/icon-512.png',
  'fonts/eb-garamond-latin-400-normal.woff2', 'fonts/eb-garamond-latin-ext-400-normal.woff2', 'fonts/eb-garamond-latin-700-normal.woff2', 'fonts/eb-garamond-latin-ext-700-normal.woff2', 'fonts/eb-garamond-latin-400-italic.woff2', 'fonts/eb-garamond-latin-ext-400-italic.woff2',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL.map((url) => new Request(url, { cache: 'reload' })))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// Network first, so updates show up as soon as the files change; the cache takes over offline
// or when no server is running.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  // no-cache: always ask the server whether a file changed (cheap when it hasn't), so updates show at once.
  e.respondWith(fetch(e.request, { cache: 'no-cache' })
    .then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(e.request, copy)); }
      return res;
    })
    .catch(() => caches.match(e.request, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))));
});
