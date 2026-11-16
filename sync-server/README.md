# Planner Sync: your own team sync server

Planner Sync works like a small private Dropbox for Planner. One computer runs it. Everyone's
Planner sends its shared tasks there and gets teammates' changes back within seconds. When two
people open the same task, both are told. No Dropbox, OneDrive or other account is needed, and
nothing leaves the computer that runs it.

## Start it (on the computer that will hold the team's files)

Double-click **Start Sync Server.command** in the `planner-app` folder (or run
`python3 sync-server/server.py`). Nothing needs installing. The window shows:

- **On this computer:** `http://127.0.0.1:8840/` (Planner itself, served by the sync server)
- **Colleagues (same Wi-Fi):** an address like `http://192.168.1.20:8840/`
- **Team code:** for example `7F3A-91C2-0B4D`. Give it only to your team.

Keep that window open while people use Planner. If the computer sleeps or the window closes,
everyone keeps working offline and catches up when it's back.

## Connect each person

1. Open the colleague address in Chrome, Edge or Safari (phones on the same Wi-Fi work too).
2. **Settings › Sync & Data › Team sync:** enter your name and work email.
3. Under **Your team server**, the address is already filled in. Enter the team code and press **Connect**.

Planner remembers the sign-in on that device. You can also connect from a Planner opened another
way (for example Start Planner.command) by typing the server address.

## What it keeps

Files are in `sync-server/data/files/Team/`, laid out exactly like the Dropbox version:

- `members/<person>-<device>.json`: each device writes only its own file, and Planner merges them
  field by field (the newest change wins), so there are never conflicts on the server.
- `files/`: attachments on shared tasks.
- `presence/`: which shared task each person has open, refreshed every 30 seconds.

`http://127.0.0.1:8840/_status` (only on the server computer) lists the files and who has a task
open. Back up the `sync-server/data` folder like any other important folder.

## Good to know

- **Changing the team code:** stop the server, edit `sync-server/data/team-code.txt`, start it again.
  People already signed in stay signed in. To sign everyone out, also delete `data/devices.json`.
- **Outside the office:** the colleague address only works on the same network. To reach it from
  anywhere, run the server on an always-on machine with a public HTTPS address, for example a
  small cloud server behind a reverse proxy such as Caddy. Use `--data` to keep the files on a
  disk that survives restarts.
- **Security:** anyone with the address and the team code can join, and traffic on the local
  network is not encrypted (plain http). For use over the internet, always put it behind HTTPS.
- Options: `--port 8840`, `--host 0.0.0.0`, `--data /path/to/data`. You can also set the team code
  with the `PLANNER_TEAM_CODE` environment variable.
