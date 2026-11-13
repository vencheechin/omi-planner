# Team sync with Dropbox (about 5 minutes, once)

Planner syncs shared tasks by talking to Dropbox directly, the same way the Dropbox app does. It
doesn't rely on a synced folder on your computer, so it works on phones too and doesn't stall the
way OneDrive folders can. When a teammate changes a shared task, you see it within a few seconds.
When two people open the same shared task, both are told who else is viewing it.

## 1. Create the Dropbox app key (one person, once)

1. Go to https://www.dropbox.com/developers/apps and choose **Create app**.
2. Choose **Scoped access**, then **Full Dropbox** (needed so Planner can see a folder someone
   shared with you). Name it, for example `OMI Planner`.
3. On the **Permissions** tab tick `files.metadata.read`, `files.content.read` and
   `files.content.write`, then press **Submit**.
4. On the **Settings** tab, under **OAuth 2 › Redirect URIs**, add each address Planner is opened
   from, exactly, ending in `/`:
   - `http://127.0.0.1:8795/` (Start Planner.command)
   - your hosted address, if you host Planner, for example `https://planner.example.com/`
   Under **Allow public clients (Implicit Grant & PKCE)** choose **Allow**.
5. Copy the **App key** (not the App secret). Either put it in `js/config.js`
   (`window.PLANNER_DROPBOX = { appKey: '…' }`) so everyone gets it, or each person pastes it in
   Planner under **Settings › Team sync with Dropbox**.

While the app is in "Development" status, Dropbox allows up to 500 people to connect, which is
plenty for a team. You don't need to apply for production.

## 2. Share a folder

1. In Dropbox, create a folder such as `OMI Planner Team` and **Share** it with your colleagues
   with **Can edit**.
2. Each colleague accepts the invitation so the folder appears in their own Dropbox
   (Dropbox › Shared › Add).

## 3. Connect each person's Planner

1. **Settings › Team sync with Dropbox**: enter your name and work email.
2. Press **Connect Dropbox…**, sign in to your own Dropbox and choose **Allow**.
3. Pick the shared folder from the list.

Opened as a file (double-clicking `index.html`), Dropbox shows a code after you allow access:
paste it into Planner. With Start Planner.command or a hosted address, Dropbox returns to
Planner by itself.

## What's in the folder

- `members/<person>-<device>.json`: each device writes only its own file, so Dropbox never has to
  resolve a conflict. Planner merges everyone's files field by field (the newest change wins).
- `files/`: attachments on shared tasks.
- `presence/`: which shared task each person has open, refreshed every 30 seconds. It's how
  Planner tells two people they have the same task open.

Only tasks assigned between people are shared. Anyone with access to the folder can open its
files, so share it only with your team. To stop syncing, choose **Disconnect** in Settings; you can
also remove Planner's access at https://www.dropbox.com/account/connected_apps.
