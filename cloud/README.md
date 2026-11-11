# Cloud sync setup (about 10 minutes, once)

Cloud sync lets you and your team use Planner on computers and phones with the same tasks. It
uses Supabase, a hosted database with a free plan. Planner still works fully offline: changes
are kept on the device and sync when it's back online.

## 1. Create the project

1. Go to https://supabase.com, sign up, and choose **New project**.
2. Name it (for example `omi-planner`), set a database password you keep somewhere safe, and pick
   the region closest to you (for Australia: **Sydney**). Wait a minute while it starts.

## 2. Create the tables

1. In the project, open **SQL Editor** and choose **New query**.
2. Paste the whole of `setup.sql` (in this folder) and press **Run**. It should say "Success".

## 3. Turn on sign-in codes

Planner signs people in with a 6-digit code sent by email, so no passwords are needed.

1. Open **Authentication > Emails** (or **Email Templates**) and choose **Magic Link**.
2. Replace the body with something like:

   ```
   <h2>Your Planner sign-in code</h2>
   <p>Enter this code in Planner: <strong>{{ .Token }}</strong></p>
   ```

3. Save.

Supabase's built-in email service is meant for testing and only sends a few emails an hour. For a
team, add your own email service under **Authentication > Emails > SMTP Settings** (Microsoft 365,
Google Workspace, or a service such as Resend all work).

## 4. Connect Planner

1. Open **Project Settings > API** (or **Data API**). Copy the **Project URL** and the **anon / public**
   key. (Never use the `service_role` key in Planner.)
2. Either paste both into Planner under **Settings > Cloud sync**, or put them in `js/config.js` so
   every copy of the app (and everyone's phone) connects without pasting.

## 5. Sign in and make your team

1. In Planner, **Settings > Cloud sync**: enter your work email, press **Email me a code**, and type
   the code.
2. Create your team (for example "OMI") and add colleagues' work emails.
3. Each colleague opens Planner, signs in with that email, and the team appears for them.

## Admins and the message log

- Whoever creates the team is an admin. Admins can make other teammates admins in
  **Settings > Cloud sync** (Make admin / Remove admin).
- Everyone can recall their own message within 5 minutes, and delete their own messages for
  themselves. Only admins can delete any message for everyone or recall any message at any time.
  The server checks this, so changing the app can't get around it.
- Every deletion and recall is written to the `message_log` table, which nobody can change or delete
  from. Admins can read the team's log in **Settings > Messages and Language > Message log**, or in
  Supabase under **Table Editor > message_log**.
- If you ran an earlier `setup.sql`, run the latest one again: it adds roles and the log, and keeps
  your data.

## What is private and what is shared

- Your personal tasks, plans, time slots, time boxes, colours, 3 Most Important Outcomes and
  settings sync only to your own devices.
- Tasks assigned between people (and the plans they sit in) are shared with your team, along with
  their comments, progress, traffic light and history. Each person's time slots stay their own.
- File attachments stay on the device they were added on; links sync.
