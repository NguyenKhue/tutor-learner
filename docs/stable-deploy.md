# Running a stable build on this computer

The app keeps its own data in **one folder on this computer**: `state.json` (question banks, your answers and their
grades, settings, each day's locked list) and automatic backups. Your scores stay in the Obsidian vault: they are only
written by `tutor.py record`, and lessons go to `Tutor/Lessons/`. A small server owns that folder; the app in the browser talks to it. This guide sets up a **stable** copy that runs next to the development
copy and never changes unless you decide to update it.

|                        | Development                                  | Stable                                   |
| ---------------------- | -------------------------------------------- | ---------------------------------------- |
| Start with             | `npm run dev`                                | `npm run stable:start` (or at login, below) |
| Address                | `http://localhost:5175`                      | `http://localhost:4175`                  |
| Data folder            | `./.data` in the project (never committed)   | the folder you choose                    |
| Changes with your code | immediately                                  | only when you run `npm run stable:build` |

Needs Node 22 or newer (`node --version`), git, `python3`, and Claude Code at `~/.local/bin/claude`, logged in (run
`claude` once in a terminal).

## 1. One-time setup

Choose where your real data will live, outside the project folder, and write your settings. Use
`~/Library/Application Support/…`: macOS does not let a background service read `~/Documents`, `~/Desktop` or
`~/Downloads` without extra permissions.

```bash
mkdir -p ~/.config/tutor-learner
cat > ~/.config/tutor-learner/stable.json <<'JSON'
{ "dataDir": "~/Library/Application Support/tutor-learner" }
JSON
```

Optional keys: `"port"` (default 4175) and `"installDir"` (default `~/stable/tutor-learner`, where the built files go).
`dataDir` must not be inside `installDir`, and the server refuses a data folder inside the project folder.

Build the stable copy from a committed branch or tag (uncommitted work is never included):

```bash
npm run stable:build                    # the current commit; refused while tracked files have uncommitted changes
npm run stable:build -- --ref main      # or any branch, tag or commit
```

Try it:

```bash
npm run stable:start
```

then open `http://localhost:4175`. Stop it with Ctrl+C.

The vault path and the `claude` path come from `tutor.config.json` in the data folder if you put one there, otherwise
from the copy built into the install folder.

## 2. Moving the data you already have

The development copy keeps its data in `./.data` of the project. Stop `npm run dev`, then copy it:

```bash
D=~/Library/Application\ Support/tutor-learner
mkdir -p "$D"
cp .data/state.json "$D"/
```

Open `http://localhost:4175` and check Today, Topics and Progress. Then keep studying at the stable address: the
development copy keeps its own data and would not know about the stable folder.

## 3. Start at login

```bash
npm run -s stable:launchd > ~/Library/LaunchAgents/vn.khue.tutor-learner.plist
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/vn.khue.tutor-learner.plist
```

Use `-s`: without it npm prints its own header into the file. The server starts at login and starts again if it stops
with an error. Logs: `~/Library/Logs/tutor-learner.log`.

```bash
launchctl kickstart -k gui/$(id -u)/vn.khue.tutor-learner   # restart (after npm run stable:build)
launchctl bootout gui/$(id -u)/vn.khue.tutor-learner        # stop and do not start at login
```

The plist records the Node binary and the `PATH` of the shell you ran it from, with `~/.local/bin` first (the server
runs `python3` and `claude`). Check the log after the first answer you send: a `Claude is not logged in` error there
means `claude` cannot read its login from the LaunchAgent. Rewrite it
(`npm run -s stable:launchd > …`) and `bootout` then `bootstrap` again if you change `stable.json` or switch Node versions.

## 4. Updating the stable copy

```bash
npm run stable:build -- --ref <branch or tag>
launchctl kickstart -k gui/$(id -u)/vn.khue.tutor-learner
```

or, for the current commit, `npm run stable:update` (build, then restart). The build happens in a temporary git worktree
and only replaces the installed files once it has finished, so a failed build leaves the running copy alone. The
installed commit is in `~/stable/tutor-learner/VERSION`.

## 5. Backups

The server copies `state.json` to `backups/state-YYYY-MM-DD.json` once a day (at start and then every hour it checks).
It keeps 14 daily copies and Sundays for 8 weeks, and never removes the newest 7. To restore one, stop the server,
copy the backup over `state.json`, and start it again:

```bash
launchctl bootout gui/$(id -u)/vn.khue.tutor-learner
cp ~/Library/Application\ Support/tutor-learner/backups/state-2026-10-20.json ~/Library/Application\ Support/tutor-learner/state.json
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/vn.khue.tutor-learner.plist
```

A `state.json` that cannot be read is moved aside as `state.json.corrupt-<time>` instead of being overwritten.
