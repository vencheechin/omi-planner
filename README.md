# OMI Planner

A task planner with boards, grids, a calendar and charts, styled to the OMI Branding Style Guide.
It works fully offline. With a shared OneDrive, Dropbox or Google Drive folder, colleagues can
assign each other tasks and check each other's work.

## Open it

Use **Google Chrome or Microsoft Edge**, since team sharing needs one of them.

**Simplest:** double-click `index.html`.

**As an installed app:** double-click `Start Planner.command`, then choose Install from the browser
menu. After that, open Planner from the Dock; it works with no internet and without the Start script.

These two keep separate data, as do different browsers, so pick one. To move between them use
Settings > Export backup, then Import backup.

## Cloud sync (computers and phones)

Settings > **Cloud sync** keeps your plans on all your devices, phones included, and shares
assigned tasks with your team. It works offline and catches up when you reconnect. It needs a free
Supabase project: follow `cloud/README.md` once, then everyone signs in with their work email and a
6-digit code.

## Working with colleagues through a shared folder (older option, computers only)

1. Create a folder in OneDrive (or Dropbox, or Google Drive) and share it with your colleagues,
   with permission to edit. Each colleague adds it to their own OneDrive ("Add shortcut to My
   files") so it appears on their computer.
2. In Planner, open Settings > Team sharing. Enter your name and work email, then choose that folder.
3. Each colleague does the same in their own Planner, choosing the same folder.
4. Add colleagues under Settings > People with their work email, or when assigning a task.

How it works:

- When you assign a task to a colleague, it appears in their Planner, in its original plan and in
  their My Tasks. You also get a plan under their name (rename it from its title), which lists every
  task you've given them.
- When they tick it, it goes to a **Checking** bucket and you're notified (bell, top right).
  Only your tick completes it. You can also send it back with a note.
- **Assignments** (left sidebar) is the report: who you assigned what, when, when it was
  submitted for review and when it was completed. Export it to Excel.
- Offline, keep working as normal. Planner saves every change on your computer, writes it into the
  folder, and OneDrive uploads it when you're back online. Changes to different parts of a task
  merge; if two people change the same thing, the later change wins.
- Only tasks assigned between people are shared. Your other tasks stay on your computer. Anyone
  with access to the shared folder can open its files, so share it only with your team.
- Notifications appear while Planner is open. Chrome asks once for permission to the folder after
  each restart; click the status at the top right to reconnect.

## Conversation

Each task has a WhatsApp-style conversation. Enter sends; Shift+Enter adds a new line.

- **+** attaches a file, photos, a camera photo, your location or a contact (or a link).
- Right-click a message (or press its ⌄) to **Reply**, **Forward** to another task, **Copy**,
  **Recall** (your own, within 5 minutes) or **Delete**. Delete lets you tick several of your own
  messages; they disappear for you only.
- Admins can also delete anyone's message for everyone and recall any message at any time.
  Every deletion and recall is logged (Settings > Messages and Language > Message log).
- Set your **Default Language** in Settings. Messages in other languages are translated with
  Google Translate and marked "Translated from …", with **Show original**.

## Import from Microsoft Planner

In Microsoft Planner, open a plan, choose **•••** next to the plan name, then **Export plan to
Excel**. In this app choose **Import from Microsoft Planner** (under New plan, or in Settings) and
pick the file; you can pick several at once. Each becomes a plan with its buckets, tasks, progress,
priority, start and due dates, labels, checklist, description and people. Importing the same file
again skips tasks already here. Comments and attachments aren't in Microsoft's export.

## Time Box

Open **Time Box** in the sidebar and choose **Day**, **Week** or **Month**. Day and Week look like
a spreadsheet: 15-minute rows, one column per day, coloured cells.

- Your weekday rhythm shows as named bands: Focus (protected), Decision Window,
  Collaboration and Tomorrow Planning. Right-click a band (or empty time) to rename it, change its
  type, colour or hours, delete it, or add a new block. The same is in Settings > Time boxing,
  with working days, hours and daily capacity. Time outside the blocks stays free.
- Types: Focus, Decision, Collaboration, Planning, Meeting, Misc, Exercise and Review. Choose
  **Edit…** at the bottom of any type dropdown to rename them, add your own and drag to reorder.
- In any task's ••• menu, **Add to Time Box** puts it in the list on the right of the Time Box
  page. Drag it onto a time (or a day in Month view), or press **Next free**.
- Add a task straight onto the grid from the bar at the top, or click empty time.
- Drag a block to move it and drag its bottom edge to resize it. Overlaps, protected focus time and
  over-capacity days are flagged first, and nothing else moves without asking.
- **Several small tasks in one time box:** drop a task onto an existing block, tick several tasks
  in the right-hand list and choose **Combine**, or type several lines when clicking empty time.
  Each task in the box has its own tick box; the box is complete when all of them are.
- **Move unfinished** proposes free slots for unfinished work; you confirm before anything moves.
- ★ marks each day's One Most Important Outcome. **Tomorrow Planning** reviews the day and sets
  tomorrow's.
- Every task has a work type, a colour, progress (10%, 50%, 80%, 100%) and a traffic light
  (Green = On Track, Yellow = At Risk, Red = Off Track, requires support). Yellow and Red ask for
  the recovery plan or support needed.
- Decision tasks have Issue → Recommendation → Impact → Decision Needed → Deadline, and a
  handling choice: same-day (Decision Window), routine (biweekly review: add that block in
  Settings) or emergency (may interrupt Focus).
- Time slots, boxes, colours and the One Most Important Outcome are personal and don't sync to
  colleagues; estimates, work type, progress, traffic light and decision briefs do.

## Your data

Everything is stored in the browser on this computer. Clearing the browser's site data deletes it,
so export a backup regularly.

## Making changes

There is no build step. Edit the files and reload. If you add or remove a file, add it to `SHELL`
in `sw.js` and change `VERSION`.

- `js/core.js`: data model, storage, backup
- `js/views.js`: sidebar, board, grid, schedule, charts
- `js/task.js`: task panel, pickers, dialogs
- `js/team.js`: checking workflow, person plans, notifications, report, folder sync
- `js/cloud.js`: cloud sync (sign-in, offline queue, field-by-field merge); `js/config.js` holds the project address
- `cloud/setup.sql`, `cloud/README.md`: the database setup and the step-by-step guide
- `js/timebox.js`: Time Box page (day, week, month), boxes, weekday rhythm, OMIO, traffic light, decisions
- `js/app.js`: actions, drag and drop, startup
- `fonts/`: EB Garamond (Regular, Bold, Italic; Latin and Latin Extended), free under the SIL Open
  Font License in `fonts/OFL-EB-Garamond.txt`. Chinese text uses Noto Serif SC if installed,
  otherwise the system's Songti or SimSun.
