# OMI Planner: technical handover

For whoever maintains this app. `README.md` is the user guide; this file is the technical overview.

## What it is

- A Progressive Web App (PWA): plain HTML, CSS and JavaScript. No framework, no build step, no
  package dependencies. Open `index.html` and it runs.
- Works offline. Data lives in the browser (IndexedDB, with localStorage for small preferences).
- Live copy: https://vencheechin.github.io/omi-planner/ (GitHub Pages, from the `main` branch of
  https://github.com/vencheechin/omi-planner).
- About 11,500 lines across 23 scripts and one stylesheet.

## Run it locally

Any static web server from this folder, for example:

```
python3 -m http.server 8080
```

then open http://localhost:8080/. Chrome or Edge is recommended (team-folder sync uses the File
System Access API). Add `?test=1` to start with test data on a separate profile.

## Deploy

Push to `main`; GitHub Pages serves the folder as-is. **Every release must bump `VERSION` in
`sw.js`** (for example `planner-v156` → `planner-v157`), or installed copies keep serving cached
files. Clients pick up the new version the next time the app is opened.

Before publishing, a quick syntax check catches most mistakes:

```
for f in js/*.js sw.js; do node --check "$f"; done
```

## Files

| File | What it does |
| --- | --- |
| `index.html` | Shell. Loads the scripts in order (order matters, see below). |
| `sw.js` | Service worker: offline cache. Bump `VERSION` per release. |
| `manifest.webmanifest`, `icons/` | Install as an app (iPhone, Android, desktop). |
| `css/app.css` | All styling. Colours are CSS variables; dark mode via `prefers-color-scheme` and `data-theme`. |
| `fonts/` | EB Garamond (SIL Open Font Licence, see `OFL-EB-Garamond.txt`). |
| `js/core.js` | Data model, normalising saved data, tasks, plans, people, buckets, labels. |
| `js/views.js` | Rendering: sidebar, boards, grid, schedule, charts, Planner hub, request pages. |
| `js/task.js` | Task panel, dialogs, toasts, label and people pickers. |
| `js/team.js` | Sharing with colleagues: assignments, checking workflow, history, notifications, merge rules. |
| `js/timebox.js` | Time Box: calendar grid, Time Box Allocation list, bookings, time spent, 3 Most Important Outcomes. |
| `js/config.js` | Cloud and Dropbox keys for this copy (blank by default; both are public-by-design keys). |
| `js/cloud.js` | Optional Supabase cloud sync (`cloud/setup.sql`, `cloud/README.md`). |
| `js/dropbox.js`, `js/devicefolder.js` | Team sync through a shared Dropbox or local/OneDrive folder. |
| `js/import.js` | Import from Microsoft Planner (Excel export). |
| `js/chat.js` | Task conversations and the message log. |
| `js/styles.js` | Colour styles (OMI Corporate, Coastal Blue, …). |
| `js/usage.js` | Button-usage counts (shown to admins). |
| `js/reminders.js` | Task reminders. |
| `js/brandplan.js` | S-Team Plan (brand × month table), approvals, Settings › Admin data, reporting lines. |
| `js/admin.js` | Admin Portal: dashboard, reporting lines, admins and departments, button usage. |
| `js/app.js` | Event handling (`actions`, `changes`, `submits`), routing, drag and drop, start-up. |
| `js/fitness.js` | Fitness: weekly targets, movement breaks. |
| `js/growth.js` | Growth: books, reading time, recommendations, book-cover scanning. |
| `js/alarm.js` | Time's-up alerts and ringtones (generated with the Web Audio API, no audio files). |
| `js/history.js` | Undo/Redo and "confirm before deleting". |
| `js/resize.js` | Resizable columns, reorderable left menu, phone swipe between Calendar and Allocation. |

## How the code is organised

- Global state is `S` (plans, tasks, people, settings…). `commit()` saves and redraws;
  `Store.save()` saves without redrawing.
- UI is rebuilt from template strings by `render()`. Clicks are routed by `data-act="name"` to
  `actions.name`; form fields use `data-change` / `data-input`; forms use `data-submit`.
- Routes are hash-based (`#/timebox`, `#/plan/<id>`, `#/admin`, …) and handled in `route()` in `app.js`.
- Scripts load in the order listed in `index.html`. Files loaded after `app.js` add handlers with
  `Object.assign(actions, …)`; files loaded before it must wait for `DOMContentLoaded`.
- Start-up waits for every script before the first draw.

## Data and sync

- On each device: IndexedDB. Settings › Export backup / Import backup moves everything as JSON.
- Team sharing (pick one): a shared Dropbox folder, a shared local/OneDrive folder, or Supabase
  (`cloud/`). Each person writes only their own file/rows; others merge them field by field,
  newest change wins. Fields listed as "local" (time-box slots, personal ordering, fitness and growth
  sessions) stay on that person's own devices.
- Outside calls: Dropbox and Supabase (only if configured), Open Library (book-cover lookup, sends
  only the words read from the cover), jsDelivr (loads Tesseract.js for cover scanning on first use).

## Known limits

- Alerts, reminders and movement-break nudges only run while the app is open (browser limitation).
- Team-folder sync needs Chrome or Edge on a computer; Dropbox or cloud sync works on phones.
- Spotify alert sounds are not built (would need a Spotify developer app and Premium).
