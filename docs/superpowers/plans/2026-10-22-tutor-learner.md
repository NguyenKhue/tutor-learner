# Tutor Learner Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A local web app where Khue studies the Obsidian Tutor points (answer questions, AI grades with `claude -p`), with all scores written through `tutor.py record` and progress shown on Today / Topics / Progress pages.

**Architecture:** A Node server (Vite plugin in dev, plain `http` server in stable) owns two things: calls to `tutor.py` (the only writer of point state in the vault) and calls to `claude -p` (lessons, question banks, grading). App-only data (question banks, attempts, the locked Today list, settings) lives in one `state.json` in the app data folder. A React UI talks to `/api/*`.

**Tech Stack:** Node 22, Vite 5, React 18, TypeScript 5.9, Tailwind 3, react-router-dom 6, dayjs, lucide-react, react-activity-calendar, vitest 2 + Testing Library + jsdom. Same versions as `~/VSCodeProjects/algorithm-learner/package.json`.

**Spec:** `docs/superpowers/specs/2026-10-22-tutor-learner-design.md` (Vietnamese). Phase 1 rules it builds on: `/Users/khue/Obsidian/Khue Vault/Tutor/Design/spec.md`.

**Reference project:** `~/VSCodeProjects/algorithm-learner`. Several tasks say "port from algorithm-learner": copy the file, rename `algorithm-learner` → `tutor-learner`, and change only what the task lists.

## Global Constraints

- Vault: `/Users/khue/Obsidian/Khue Vault`. Script: `<vault>/.claude/skills/tutor/scripts/tutor.py`, run as `python3 <script> --vault <vault> [--date YYYY-MM-DD] <cmd> ...`. Every command prints JSON; exit code ≠ 0 prints `{"error": "..."}`.
- Never write `status`, `mastery`, `box`, `next_review`, `history` in the vault. Only `tutor.py record` changes point notes.
- The server writes in the vault only under `Tutor/Lessons/`. Reject `..`, absolute paths and symlinks that leak out.
- `claude` binary: `~/.local/bin/claude` (configurable). Exact args: `-p --model sonnet --tools "" --setting-sources "" --no-session-persistence --output-format json --json-schema <schemaJson>`; prompt on stdin; `cwd` = app data folder. Never `--bare`.
- Claude JSON output: success = `is_error: false` and `structured_output` matching the schema. Anything else is an error, never a wrong answer.
- Timeout 90 s per call; up to 3 retries with waits 2 s, 6 s, 18 s; no retry on usage-limit or not-logged-in errors.
- Ports: dev 5175, stable 4175. Listen on `127.0.0.1` only. LaunchAgent label `vn.khue.tutor-learner`. Log `~/Library/Logs/tutor-learner.log`. Stable install dir `~/stable/tutor-learner`. Stable data dir default `~/Library/Application Support/tutor-learner`. Dev data dir `./.data`.
- Write APIs (`POST`) accept a request only when the `Origin` header equals the app's own origin (`http://127.0.0.1:<port>` or `http://localhost:<port>`). No CORS headers.
- Spawn `python3` and `claude` with `child_process.spawn(cmd, argsArray)`, never through a shell.
- Learning content (lessons, questions, grading, English feedback) is in English, short sentences, simple words (TOEIC 500–600 reader), correct technical terms. UI labels in English.
- "Today" = local calendar date `YYYY-MM-DD` in `Asia/Ho_Chi_Minh`; pass it to every `tutor.py` call as `--date`.
- Defaults: 3 new points per day; English feedback on; model `sonnet`.
- Tests never touch the real vault or call the real `claude`.

## Review Focus

1. **Server restarts in the middle of grading** → the attempt stays `pending` (or `graded`) in `state.json`, and the Study page offers "Grade again" / "Save result" for it. Test: Task 7 `recovers pending and graded attempts after restart`.
2. **`record` fails after grading succeeded** (python error, note locked) → attempt stays `graded`, UI shows the error and a "Save result" retry; no second history entry when the retry succeeds. Test: Task 7 `keeps graded attempt when record fails and records once on retry`.
3. **Point studied in the terminal the same day** → web refetches export on focus; a Today item whose point already has a history entry dated today is shown done. Test: Task 8 `marks item done when history has an entry today`.
4. **A source wikilink does not resolve** (renamed note, `[[Note#Heading]]`, `[[Note|alias]]`) → lesson generation proceeds with the sources that exist and the lesson/Study page lists the missing ones; with zero sources, no AI call and a clear error. Test: Task 3 `strips heading and alias` and Task 7 `refuses to generate when no source resolves`.
5. **Two answers submitted quickly** (double click, two tabs) → second submit for the same attempt id is rejected; `record` calls run one at a time. Test: Task 2 `serializes record calls` and Task 7 `rejects a second submit for the same attempt`.

---

## File Structure

```
server/
  tutor.ts          spawn tutor.py, typed wrappers, record queue
  vault.ts          wikilink → file, lesson paths, safe write under Tutor/Lessons
  roadmap.ts        read topic_order from Tutor/Roadmap.md
  claude.ts         spawn claude -p, timeout, retries, error classes
  prompts.ts        prompt builders + JSON schemas for lesson / questions / grade
  state.ts          state.json store (atomic write, corrupt file moved aside)
  study.ts          study service: lessons, banks, attempts, grading, recording, prefetch
  api.ts            /api/* middleware + Origin check
  plugin.ts         Vite plugin (dev)
  main.ts, cli.ts, backups.ts     stable server (ported)
  testVault.ts      test helper: temp vault with real tutor.py
  fakeClaude.mjs    test helper: fake claude binary
scripts/            stable-build / start / launchd + lib/stable.mjs (ported)
src/
  lib/types.ts      shared types (server imports them too)
  lib/today.ts      Today list building and locking
  lib/stats.ts      streak, heatmap, forecast, pace
  lib/day.ts        today() in Asia/Ho_Chi_Minh
  api/client.ts     fetch helpers
  hooks/useTutorData.ts
  app/App.tsx, app/Layout.tsx
  pages/TodayPage.tsx, StudyPage.tsx, TopicsPage.tsx, PointPage.tsx, ProgressPage.tsx, SettingsPage.tsx
  components/AnswerBox.tsx, McqOptions.tsx, GradeResult.tsx, EnglishFeedback.tsx, LessonView.tsx
  styles/tokens.css, styles/app.css (ported)
```

## Shared types (`src/lib/types.ts`, created in Task 2, extended later)

```ts
export type PointType = 'memory' | 'procedure' | 'concept'
export type Status = 'new' | 'learning' | 'mastered'
export interface HistoryEntry { d: string; kind: 'learn' | 'review'; ok: boolean; q: string; why: string }
export interface Point { id: string; topic: string; type: PointType; interview: boolean; order: number; sources: string[]
  status: Status; mastery: number; box: number | null; next_review: string | null; history: HistoryEntry[] }
export interface ExportData { generated: string; config: TutorConfig; points: Point[]; skipped: unknown[] }
export interface TutorConfig { interview_date: string | null; interview_buffer_days: number; threshold: number; daily_review_cap: number }
export interface DuePoint { point: string; topic: string; type: PointType; interview: boolean; overdue_days: number }
export interface RecordResult { point: string; mastery: number; status: Status; passed_gate: boolean; box: number | null; next_review: string | null }

export type QuestionKind = 'pretest' | 'mcq' | 'open'
export interface Question { q: string; kind: QuestionKind; prompt: string
  options?: string[]; answer?: number; misconceptions?: string[]   // mcq: 4 options, answer index 0-3, misconceptions[i] for each wrong option
  criteria?: string[] }                                              // open: 2-4 required ideas; pretest: 1-3 key ideas
export interface QuestionBank { point: string; created: string; questions: Question[] }

export interface Grade { ok: boolean; why: string; missing: string[]; feedback: string }
export interface EnglishNotes { corrected: string; notes: string[] }
export type AttemptState = 'pending' | 'graded' | 'recorded' | 'failed'
export interface Attempt { id: string; point: string; q: string; kind: 'learn' | 'review'; answer: string; date: string
  state: AttemptState; grade?: Grade; english?: EnglishNotes; appealed?: boolean; appeal?: string
  record?: RecordResult; error?: { code: 'limit' | 'auth' | 'failed' | 'record'; message: string } }
export interface TodayList { date: string; review: string[]; fresh: string[]; extra: string[] }
export interface Settings { newPerDay: number; englishFeedback: boolean }
export interface AppState { version: 1; banks: Record<string, QuestionBank>; attempts: Attempt[]; today: TodayList | null; settings: Settings }
```

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `tailwind.config.js`, `postcss.config.js`, `index.html`, `src/main.tsx`, `src/app/App.tsx`, `src/styles/tokens.css`, `src/styles/app.css`, `src/index.css`, `src/test/setup.ts`, `src/app/App.test.tsx`, `tutor.config.json`
- Modify: `.gitignore` (already has `node_modules/ dist/ dist-server/ .data/`)

**Interfaces:**
- Produces: `npm test`, `npm run typecheck`, `npm run dev` (port 5175, strictPort), alias `@` → `src`. `tutor.config.json` = `{ "vault": "/Users/khue/Obsidian/Khue Vault", "claudeBin": "~/.local/bin/claude", "timezone": "Asia/Ho_Chi_Minh" }`.

- [ ] **Step 1:** Port `package.json` (scripts `dev`, `test`, `typecheck`, `server:build`, `stable:*` with label `vn.khue.tutor-learner`), `tsconfig.json`, `tailwind.config.js`, `postcss.config.js`, `src/styles/*`, `src/test/setup.ts` from algorithm-learner. Drop dependencies `dexie*`, `jotai`, `shiki`, `ts-fsrs`, `@radix-ui/react-select`, `fake-indexeddb`. `vite.config.ts` as in algorithm-learner with port 5175 and no plugin yet.
- [ ] **Step 2: Write the failing test** `src/app/App.test.tsx`: `renders the app shell` — render `<App />` in a MemoryRouter, expect `screen.getByText('Tutor')`.
- [ ] **Step 3:** `npm install`, then `npx vitest run src/app/App.test.tsx` → FAIL (App missing).
- [ ] **Step 4:** Minimal `App.tsx` rendering a header "Tutor".
- [ ] **Step 5:** `npm test && npm run typecheck` → PASS, no errors.
- [ ] **Step 6:** Commit `chore: scaffold tutor-learner`.

### Task 2: tutor.py wrapper

**Files:**
- Create: `src/lib/types.ts` (types above), `server/tutor.ts`, `server/testVault.ts`, `server/tutor.test.ts`

**Interfaces:**
- Produces:
  - `class TutorCliError extends Error { constructor(message: string, public exitCode: number) }`
  - `interface TutorCli { exportData(date: string): Promise<ExportData>; due(date: string): Promise<DuePoint[]>; next(date: string): Promise<{ mode: 'review'|'learn'|'none'; point?: string }>; record(a: { point: string; ok: boolean; kind: 'learn'|'review'; q: string; why: string; date: string }): Promise<RecordResult> }`
  - `createTutorCli(opts: { vault: string; script?: string; python?: string }): TutorCli` — `script` defaults to `<vault>/.claude/skills/tutor/scripts/tutor.py`, `python` to `python3`.
  - `server/testVault.ts`: `makeTestVault(points: Array<{ topic: string; name: string; type: PointType; order: number; interview?: boolean; sources?: string[]; history?: HistoryEntry[] }>, opts?: { topicOrder?: string[]; files?: Record<string, string> }): { vault: string; cleanup(): void }` — temp dir with `.claude/skills/tutor/scripts/tutor.py` **copied from the real vault**, `Tutor/config.md` (interview_date 2027-01-07, buffer 3, threshold 0.8, cap 10), `Tutor/Roadmap.md` with `topic_order`, point notes in phase-1 frontmatter format (copy the shape of an existing note under `Tutor/Points/`), plus extra `files` (relative path → content) for source notes.

- [ ] **Step 1: Write failing tests** in `server/tutor.test.ts`:
  - `exportData returns all points` — vault with 2 points → `points.length === 2`, `points[0].status === 'new'`.
  - `record appends history and returns derived fields` — record `ok: true, kind: 'learn', q: 'q1', why: 'x'` on a `memory` point at `2026-10-22` → result `status === 'learning'`, `mastery === 0.5`; export shows `history.length === 1`.
  - `record rejects unknown point` — rejects with `TutorCliError`, message contains the script's `error` text.
  - `serializes record calls` — fire 5 `record` calls without awaiting on one point; after all settle, `history.length === 5` and no rejection.
- [ ] **Step 2:** `npx vitest run server/tutor.test.ts` → FAIL.
- [ ] **Step 3:** Implement. `spawn(python, [script, '--vault', vault, '--date', date, ...args])`, collect stdout, `JSON.parse`; non-zero exit → `TutorCliError(parsed.error ?? stderr)`. `record` goes through a promise chain so only one runs at a time (reads may run in parallel).
- [ ] **Step 4:** Tests PASS.
- [ ] **Step 5:** Commit `feat: tutor.py wrapper`.

### Task 3: Vault paths and roadmap

**Files:**
- Create: `server/vault.ts`, `server/roadmap.ts`, `server/vault.test.ts`, `server/roadmap.test.ts`

**Interfaces:**
- Produces:
  - `class BadPath extends Error {}`
  - `resolveWikilink(vault: string, link: string): string | null` — strips `[[ ]]`, `#heading`, `|alias`; tries `<vault>/<target>.md`, then `<vault>/<target>` (if it already ends in `.md`), then the first file in the vault (excluding `.obsidian`, `.git`, `node_modules`) whose basename without `.md` equals the last path segment. Returns an absolute path inside the vault or null.
  - `readSources(vault: string, links: string[]): { found: Array<{ link: string; path: string; text: string }>; missing: string[] }`
  - `lessonRelPath(pointId: string): string` → `Tutor/Lessons/<topic>/<name>.md` for id `<topic>/<name>`.
  - `readLesson(vault: string, pointId: string): string | null` (body without frontmatter)
  - `writeLesson(vault: string, pointId: string, markdown: string): void` — writes frontmatter `tutor: lesson` and `point: "[[Tutor/Points/<id>|<name without NN prefix>]]"` then the body; atomic (tmp + rename); throws `BadPath` unless the real path of the target's parent is inside `<vault>/Tutor/Lessons`.
  - `obsidianUrl(vaultName: string, relPath: string): string` → `obsidian://open?vault=<enc>&file=<enc relPath without .md>`.
  - `readTopicOrder(vault: string): string[]` — parses the `topic_order: [...]` JSON-array line in `Tutor/Roadmap.md` frontmatter; `[]` if missing.

- [ ] **Step 1: Write failing tests:**
  - `resolves a full path link`, `resolves by basename`, `strips heading and alias` (`[[Android/X#Part|x]]` → `.../Android/X.md`), `returns null for missing`.
  - `readSources splits found and missing`.
  - `writeLesson writes frontmatter and body` and `writeLesson refuses a symlinked Lessons folder` (make `Tutor/Lessons` a symlink to a dir outside → throws `BadPath`) and `rejects ids with ..`.
  - `readTopicOrder parses the roadmap line` (uses the fixture's `topicOrder`).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: vault paths, lessons and roadmap order`.

### Task 4: Claude runner

**Files:**
- Create: `server/claude.ts`, `server/fakeClaude.mjs`, `server/claude.test.ts`

**Interfaces:**
- Produces:
  - `class ClaudeError extends Error { constructor(public code: 'limit' | 'auth' | 'failed', message: string) }`
  - `runClaude<T>(opts: { prompt: string; schema: object; bin: string; cwd: string; timeoutMs?: number; delaysMs?: number[]; sleep?: (ms: number) => Promise<void> }): Promise<T>` — defaults `timeoutMs = 90_000`, `delaysMs = [2000, 6000, 18000]`.
  - `fakeClaude.mjs`: an executable node script driven by env `FAKE_CLAUDE_MODE` (`ok` | `bad-json` | `schema-miss` | `hang` | `limit` | `auth` | `fail-then-ok`) and `FAKE_CLAUDE_OUTPUT` (JSON for `structured_output`). `fail-then-ok` uses a counter file `FAKE_CLAUDE_COUNTER`. It also writes its argv and stdin to `FAKE_CLAUDE_LOG` so tests can check the args.

Error classification (the CLI's message wording is not documented; keep these patterns in one constant so they are easy to adjust): text of stdout+stderr matching `/usage limit|rate limit|limit reached|quota/i` → `limit`; `/not logged in|please run \/login|authentication|unauthorized|401/i` → `auth`; everything else (non-zero exit, timeout, unparsable JSON, `is_error: true`, missing `structured_output`) → `failed`. Retry only `failed`.

- [ ] **Step 1: Write failing tests** (pass a `sleep` stub that records waits):
  - `passes the exact args and the prompt on stdin` — log shows `-p --model sonnet --tools  --setting-sources  --no-session-persistence --output-format json --json-schema <json>` and stdin = prompt; no `--bare`.
  - `returns structured_output`.
  - `retries failed calls with 2s, 6s, 18s then throws failed` (`bad-json` → 4 runs, waits `[2000, 6000, 18000]`, `ClaudeError` code `failed`).
  - `succeeds after one failure` (`fail-then-ok`).
  - `does not retry usage limit` (`limit` → 1 run, code `limit`) and `does not retry auth` (code `auth`).
  - `kills the process after the timeout` (`hang`, `timeoutMs: 200`, `delaysMs: []` → code `failed`, child no longer running).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: claude -p runner with retries`.

### Task 5: Prompts and schemas

**Files:**
- Create: `server/prompts.ts`, `server/prompts.test.ts`

**Interfaces:**
- Consumes: `readSources` result shape (Task 3), `Point`, `Question` (types).
- Produces:
  - `LESSON_SCHEMA` → `{ markdown: string }`; `buildLessonPrompt(point: Point, title: string, sources: Array<{ link: string; text: string }>): string`
  - `QUESTIONS_SCHEMA` → `{ questions: Question[] }`; `buildQuestionsPrompt(point: Point, title: string, sources, avoidCodes: string[]): string` — asks for exactly 1 `pretest` + 3 main questions (`mcq` for `memory`/`procedure`, `open` for `concept`).
  - `GRADE_SCHEMA` → `{ grade: Grade; english: EnglishNotes | null }`; `buildGradePrompt(a: { point: Point; title: string; question: Question; answer: string; sources; english: boolean; appeal?: string }): string`
  - `validateBank(raw: { questions: Question[] }, avoidCodes: string[]): Question[]` — throws `ClaudeError('failed', ...)` unless: exactly one `pretest`; 3 main questions of the right kind; each `mcq` has 4 options, `answer` 0–3, 4 `misconceptions` entries (empty string at the answer index); each `open` has 2–4 criteria; the `pretest` is a short open question with 1–3 criteria; codes are unique. It **renumbers** codes to `q<N>` starting after the highest number in `avoidCodes` (pretest included), so codes already in `history` are never reused.
  - `pointTitle(pointId: string): string` — name without the `NN ` prefix.

Prompt content rules (from `SKILL.md`, put them in every prompt): teach only from the given source text; say so if sources are missing or contradict; English, short sentences, simple words, correct technical terms, the register of an interview answer; wrong MCQ options each map to a real misconception and have similar length and tone; grading judges only against the stated criteria, `why` is one line; `english.corrected` keeps Khue's meaning, `notes` max 3, each one short. With `appeal`, the grader reads Khue's argument and decides again; it may keep the first verdict.

- [ ] **Step 1: Write failing tests:** `lesson prompt contains every source text and the point scope`, `grade prompt includes criteria for open questions`, `grade prompt omits English instructions when english is false`, `validateBank renumbers after avoided codes` (avoid `['q1','q2']` → codes `q3..q6`), `validateBank rejects an mcq with 3 options`, `validateBank rejects a concept bank that uses mcq`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: prompts and schemas`.

### Task 6: App state store and backups

**Files:**
- Create: `server/state.ts`, `server/state.test.ts`, `server/backups.ts`, `server/backups.test.ts`

**Interfaces:**
- Produces:
  - `interface StateStore { read(): Promise<AppState>; update<T>(fn: (s: AppState) => T): Promise<T> }` and `createStateStore(file: string): StateStore` — `update` runs one at a time, clones state, applies `fn`, writes atomically (tmp + rename), returns `fn`'s result. Missing file → `emptyState()`. Unparsable or invalid file → rename to `state.json.corrupt-<timestamp>` and start empty.
  - `emptyState(): AppState` → `{ version: 1, banks: {}, attempts: [], today: null, settings: { newPerDay: 3, englishFeedback: true } }`
  - `runBackups(stateFile, backupsDir, now)` — ported unchanged from algorithm-learner.

- [ ] **Step 1: Write failing tests:** `starts empty when no file`, `persists updates across stores`, `moves a corrupt file aside`, `runs updates one at a time` (10 concurrent `update` pushing to `attempts` → length 10). Port `backups.test.ts`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement (port the atomic-write and corrupt-file parts of algorithm-learner `server/state.ts`; drop its op model). **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: app state store and backups`.

### Task 7: Study service

**Files:**
- Create: `server/study.ts`, `server/study.test.ts`

**Interfaces:**
- Consumes: `TutorCli` (T2), vault functions (T3), `runClaude`/`ClaudeError` (T4), prompts (T5), state store (T6).
- Produces `createStudyService(deps: { vault: string; tutor: TutorCli; store: StateStore; claude: <T>(prompt: string, schema: object) => Promise<T>; today: () => string; newId?: () => string }): StudyService` with:
  - `getLesson(pointId): Promise<{ markdown: string; missingSources: string[]; obsidianUrl: string }>` — existing lesson file → no AI call; else generate, `writeLesson`, return. Zero sources found → throw `StudyError('no-sources', ...)` without calling Claude.
  - `getBank(pointId): Promise<QuestionBank>` — cached in state; else generate with `avoidCodes` = all `q` in the point's history, `validateBank`, save.
  - `regenerateBank(pointId): Promise<QuestionBank>` — `avoidCodes` = history codes ∪ old bank codes.
  - `pickQuestion(point: Point, bank: QuestionBank, kind: 'learn'|'review'): Question` — main questions only; prefer a code with no `ok` in history; for `concept` after one `ok`, a different code; for review, the code answered longest ago (never answered first).
  - `submit(a: { point: string; q: string; kind: 'learn'|'review'; answer: string }): Promise<Attempt>` — saves attempt `pending` **before** grading; `mcq` graded locally (`answer` is the option index as a string; `why` = `"Chose option X; correct is Y"`, `feedback` = the misconception of the chosen option); `open` graded by Claude (with English when the setting is on); then `graded`; then `tutor.record({ ok, kind, q, why: grade.why, date: today })` → `recorded` with `record`. `ClaudeError` → attempt keeps `pending` with `error.code` = the Claude code. Record failure → stays `graded`, `error.code = 'record'`.
  - `submitPretest(pointId, answer: string | null): Promise<{ feedback: string }>` — never records; `null` ("I don't know yet") returns `"Key idea: " + criteria.join('; ')` without an AI call; a typed answer gets a one-line AI feedback (grade prompt with `english: false`, `feedback` only).
  - `retry(attemptId): Promise<Attempt>` — `pending` → grade then record; `graded` → record only.
  - Recording rule (keeps one history entry per answer, spec 5.4): mcq answers and passing open answers record right away. A failing open answer stays `graded` until Khue presses "Continue" (`confirm`) or "I think this is right" (`appeal`).
  - `appeal(attemptId, reason): Promise<Attempt>` — only for a `graded`, not yet `appealed` attempt; regrades once with the reason, sets `appealed: true`, then records the new result.
  - `confirm(attemptId): Promise<Attempt>` — records a `graded` attempt.
  - `prefetch(pointIds: string[]): void` — background, one point at a time: `getLesson` for points with status `new`, then `getBank`; errors logged and swallowed; skips work already cached; a single running loop (calling again adds ids to its queue).
- `class StudyError extends Error { constructor(public code: 'no-sources' | 'bad-state' | 'not-found', message: string) }`

- [ ] **Step 1: Write failing tests** (temp vault from T2, fake `claude` function returning canned objects, real `tutor.py`):
  - `reuses an existing lesson without calling claude`; `writes a generated lesson under Tutor/Lessons`; `refuses to generate when no source resolves`.
  - `bank avoids codes already in history`.
  - `mcq answer is graded locally and recorded` (claude never called; history gets `ok` with the chosen q).
  - `open answer that passes is recorded with grade.why`.
  - `failed open answer waits for confirm`, then `confirm records it once`.
  - `appeal regrades once and records`; `second appeal is rejected` (`StudyError('bad-state')`).
  - `limit error keeps the attempt pending with code limit` and nothing in history.
  - `keeps graded attempt when record fails and records once on retry` (make `tutor.record` throw once).
  - `recovers pending and graded attempts after restart` (new service over the same store file sees them; `retry` completes them).
  - `rejects a second submit for the same attempt` (submit returns attempt id; a `retry` on a `recorded` attempt → `StudyError('bad-state')`; two concurrent `submit` for the same point+q while one is `pending` → second rejected with `bad-state`).
  - `pickQuestion gives a different code after one ok on a concept point`.
  - `pretest never writes history`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: study service`.

### Task 8: Today list logic

**Files:**
- Create: `src/lib/day.ts`, `src/lib/today.ts`, `src/lib/today.test.ts`, `server/today.test.ts`

**Interfaces:**
- Produces:
  - `localToday(tz = 'Asia/Ho_Chi_Minh', now = new Date()): string` (in `day.ts`, `Intl.DateTimeFormat('en-CA', { timeZone })`).
  - `nextNewPoints(points: Point[], topicOrder: string[], n: number, exclude: Set<string>): string[]` — non-mastered points with status `new` or `learning`, sorted by topic position in `topicOrder` (topics not listed go last, by name), then `order`, then `interview` first; skip `exclude`.
  - `buildToday(a: { date: string; due: DuePoint[]; points: Point[]; topicOrder: string[]; cap: number; newPerDay: number }): TodayList` — `review` = first `cap` due ids in the order given; `fresh` = `nextNewPoints(..., newPerDay, set(review))`; `extra = []`.
  - `ensureToday(prev: TodayList | null, build: () => TodayList, date: string): TodayList` — keeps `prev` when `prev.date === date`.
  - `addExtra(list: TodayList, points: Point[], topicOrder: string[], due: DuePoint[]): TodayList` — first due id not in the list, else next new point; appends to `extra`.
  - `itemDone(point: Point, date: string): boolean` — the point's history has an entry with `d === date`.

- [ ] **Step 1: Write failing tests:**
  - `review keeps tutor.py order and cap`, `fresh follows topic_order then order`, `interview first within the same order`, `locked list survives a rebuild on the same day`, `new day rebuilds`, `addExtra prefers due points`, `marks item done when history has an entry today`.
  - `server/today.test.ts`: `first fresh point matches tutor.py next` — temp vault with 3 topics and a non-trivial `topic_order`, no due points → `nextNewPoints(...)[0] === (await tutor.next(date)).point`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: today list`.

### Task 9: HTTP API and dev plugin

**Files:**
- Create: `server/api.ts`, `server/api.test.ts`, `server/plugin.ts`
- Modify: `vite.config.ts` (add plugin, ignore `.data/**` in watch)

**Interfaces:**
- Consumes: everything in Tasks 2–8.
- Produces `createApiMiddleware(paths: { configFile: string; dataDir: string }, deps?: { claudeBin?: string; python?: string }): Connect.NextHandleFunction`. Config from `configFile` (`tutor.config.json` shape, `~` expanded). State at `<dataDir>/state.json`. Routes (JSON in/out, `Cache-Control: no-store`):

| Route | Body → Response |
|---|---|
| `GET /api/overview` | → `Overview` = `{ today: string; export: ExportData; topicOrder: string[]; list: TodayList; settings: Settings; vaultName: string }` (add `Overview` to `types.ts`) — builds/locks Today, saves it, calls `prefetch(list ids)` unless env `TUTOR_NO_PREFETCH=1` |
| `POST /api/today/extra` | → `TodayList` |
| `GET /api/lesson?point=` | → `getLesson` result |
| `GET /api/bank?point=` | → `QuestionBank` |
| `POST /api/bank/regenerate` `{ point }` | → `QuestionBank` |
| `POST /api/pretest` `{ point, answer: string \| null }` | → `{ feedback }` |
| `POST /api/answer` `{ point, q, kind, answer }` | → `Attempt` |
| `POST /api/attempt/retry` `{ id }` · `/confirm` `{ id }` · `/appeal` `{ id, reason }` | → `Attempt` |
| `GET /api/attempts?point=` | → `Attempt[]` (newest first) |
| `GET /api/open-attempts` | → attempts in `pending` or `graded` |
| `POST /api/settings` `Partial<Settings>` | → `Settings` (`newPerDay` integer 1–10) |
| `GET /api/health` | → `{ claude: { lastError: Attempt['error'] \| null }, vault: boolean }` |

Errors: `StudyError` → 409 (`bad-state`), 404 (`not-found`), 422 (`no-sources`) with `{ error, code }`; `ClaudeError` from lesson/bank → 503 `{ error, code }`; `TutorCliError` → 502; bad JSON → 400; `POST` with wrong/missing `Origin` → 403.

- [ ] **Step 1: Write failing tests** (start the middleware on a real `http` server on port 0 against a temp vault and fake claude): `overview locks today's list`, `answer flow records through tutor.py`, `post without origin is rejected 403`, `post with foreign origin is rejected 403`, `no-sources maps to 422`, `limit maps to 503 with code limit`, `settings rejects newPerDay 0`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement `api.ts` (port `send`/`readBody` from algorithm-learner `server/plugin.ts`) and `plugin.ts` (`tutorApiPlugin()`, dev paths `<root>/tutor.config.json`, `<root>/.data`). **Step 4:** Run → PASS.
- [ ] **Step 5:** `TUTOR_NO_PREFETCH=1 npm run dev`, then `curl -s http://127.0.0.1:5175/api/overview | head -c 300` → JSON with `"today"` and the real vault's points (239 on 2026-10-22). With prefetch off this writes only `./.data/state.json` and calls no AI. Stop the server.
- [ ] **Step 6:** Commit `feat: http api`.

### Task 10: Stable server and LaunchAgent

**Files:**
- Create (port from algorithm-learner): `server/main.ts`, `server/cli.ts`, `server/main.test.ts`, `scripts/lib/stable.mjs`, `scripts/lib/stable.d.mts`, `scripts/stable-build.mjs`, `scripts/stable-start.mjs`, `scripts/stable-launchd.mjs`, `scripts/stable.test.ts`, `docs/stable-deploy.md`

Changes against the originals: `DEFAULT_PORT = 4175`; `PLIST_LABEL = 'vn.khue.tutor-learner'`; config path `~/.config/tutor-learner/stable.json`; server uses `createApiMiddleware` from Task 9 with `configFile` = `<dataDir>/tutor.config.json`, falling back to the built-in copy; `projectAbove` checks `pkg.name === 'tutor-learner'`; listen host `127.0.0.1`; plist `PATH` always starts with `~/.local/bin` (expanded) followed by the current `PATH`; log `~/Library/Logs/tutor-learner.log`; plist keeps `RunAtLoad` + `KeepAlive`.

- [ ] **Step 1:** Port the tests first and adapt them: `main.test.ts` (serves index.html, `/api/health`, refuses a data dir inside the project), `stable.test.ts` (plist has label, port 4175, `RunAtLoad`, `KeepAlive`, PATH begins with the expanded `~/.local/bin`). Run → FAIL.
- [ ] **Step 2:** Port the code with the changes above. Run → PASS.
- [ ] **Step 3:** Commit `feat: stable server and launchd`.

### Task 11: UI shell, data hook and Today page

**Files:**
- Create: `src/api/client.ts`, `src/hooks/useTutorData.ts`, `src/app/Layout.tsx`, `src/pages/TodayPage.tsx`, `src/pages/TodayPage.test.tsx`, `src/test/fixtures.ts`
- Modify: `src/app/App.tsx` (routes `/`, `/study/:pointId*`, `/topics`, `/topics/:topic`, `/point/*`, `/progress`, `/settings`)

**Interfaces:**
- Produces:
  - `api.get<T>(path)`, `api.post<T>(path, body)` — throw `ApiError { status, code?, message }`.
  - `useTutorData(): { data: Overview | null; error: ApiError | null; reload(): Promise<void> }` — loads `/api/overview`; reloads on window focus (at most every 30 s) and when `reload()` is called. Provide it through a React context in `Layout` so every page shares one copy.
  - `fixtures.ts`: `makePoint(partial)`, `makeOverview(partial)`.
- Today page content: top bar = days left until `config.interview_date` ("77 days to interview"), streak (from Task 13's `streak()`; use a stub `0` until Task 13 and wire it there), "N / M done" (done = `itemDone` for ids in `review ∪ fresh ∪ extra`). Two lists "Review" and "New" (and "Extra" when non-empty): title (`pointTitle`), topic, type chip, `interview` dot, done check. Click → `/study/<id>?kind=review|learn`. Button "Study one more" → `POST /api/today/extra`. Empty state: "Nothing left today." Layout nav: Today, Topics, Progress, Settings; dark/light from `prefers-color-scheme` + toggle saved in `localStorage` (try/catch), as in algorithm-learner.

- [ ] **Step 1: Write failing tests:** `shows countdown and done count`, `lists review before new`, `done items show a check`, `study one more appends an item` (mock fetch).
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: today page`.

### Task 12: Study page

**Files:**
- Create: `src/pages/StudyPage.tsx`, `src/pages/StudyPage.test.tsx`, `src/components/LessonView.tsx`, `src/components/AnswerBox.tsx`, `src/components/McqOptions.tsx`, `src/components/GradeResult.tsx`, `src/components/EnglishFeedback.tsx`, `src/hooks/useHotkey.ts` (port)

**Interfaces:**
- Consumes: `/api/lesson`, `/api/bank`, `/api/pretest`, `/api/answer`, `/api/attempt/*`, `/api/open-attempts`; `pickQuestion` logic stays on the server — **add** `GET /api/question?point=&kind=` → `Question` in `server/api.ts` (calls `getBank` + `pickQuestion`) with a test `question route returns a main question` in `server/api.test.ts`.

Flow (state machine in the page):
- `kind=learn`: `pretest` → `lesson` → `question` → `result`. `kind=review`: `question` → `result`, with "Show lesson" button always available and the lesson shown automatically when `grade.ok` is false.
- Pretest: shows the pretest prompt, a text box, buttons "Check" and "I don't know yet"; shows the one-line feedback, then "Read the lesson".
- Lesson: rendered markdown (simple renderer: headings, paragraphs, lists, code blocks, inline code, links; no new dependency), "Open in Obsidian" link, a warning list of `missingSources`.
- Question: `mcq` → 4 options, keys `1`–`4`; `open` → textarea, `Cmd+Enter` submits. While waiting show "Grading…" (and "Writing lesson…" / "Preparing questions…" while those load).
- Result: "Correct" / "Not yet", `why`, `missing` list, `feedback`; English panel (`EnglishFeedback`) when `english` exists: Khue's text, corrected text, notes. Shows exactly the `record` result: `mastery` (as %), `status`, `next_review`, and "Mastered!" only when `record.passed_gate` is true. Failed open answer (state `graded`, not recorded): buttons "Continue" (confirm) and "I think this is right" (textarea for the reason → appeal; hidden after one appeal). Buttons "One more question" (concept points not yet mastered) and "Next" (`n`) → next not-done Today item, or Today.
- Errors: `limit` → "Claude usage limit reached. Your answer is saved. Try again later." + "Grade again"; `auth` → "Claude is not logged in. Run `claude` in a terminal and log in, then press Grade again."; `failed` → "Grading failed. Your answer is saved." + "Grade again"; `record` → "Could not save the result." + "Save result". `no-sources` → "No source note found for this point:" + the links. On load, if `/api/open-attempts` has one for this point, show it in its current state first.
- "Regenerate questions" link on the question step (confirm dialog).
- Call `reload()` from `useTutorData` each time an attempt reaches `recorded`, so Today and the other pages show the new status.

- [ ] **Step 1: Write failing tests** (mock fetch): `learn flow goes pretest, lesson, question, result`, `review flow skips pretest and lesson`, `shows lesson after a wrong review answer`, `mcq answers with number keys`, `shows Mastered only when passed_gate`, `failed open answer offers continue and appeal`, `appeal button disappears after one appeal`, `limit error keeps the answer and offers grade again`, `english panel hidden when attempt has no english`, `resumes an open attempt on load`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: study page`.

### Task 13: Topics, Point detail, Progress, Settings

**Files:**
- Create: `src/lib/stats.ts`, `src/lib/stats.test.ts`, `src/pages/TopicsPage.tsx`, `src/pages/PointPage.tsx`, `src/pages/ProgressPage.tsx`, `src/pages/SettingsPage.tsx`, `src/pages/pages.test.tsx`
- Modify: `src/pages/TodayPage.tsx` (wire `streak`)

**Interfaces:**
- Produces in `stats.ts`:
  - `activityByDay(points: Point[]): Map<string, number>` — count of history entries per `d`.
  - `streak(points: Point[], today: string): number` — consecutive days with ≥1 entry ending today, or ending yesterday if today has none yet.
  - `dueForecast(points: Point[], today: string, days = 14): Array<{ date: string; count: number }>` — points with `next_review` on each day; overdue ones count on `today`.
  - `pace(points: Point[], today: string, interviewDate: string | null, bufferWeeks = 4): { remaining: number; daysLeft: number; perDay: number | null }` — `remaining` = non-mastered points; `daysLeft` = days until interview minus `bufferWeeks*7` (min 1); `perDay = ceil(remaining / daysLeft)`; `null` without interview date.
  - `topicSummary(points: Point[], topicOrder: string[]): Array<{ topic: string; total: number; new: number; learning: number; mastered: number; interviewPending: number }>` in `topicOrder`.
- Topics page: one row per topic with the counts and a progress bar; click → `/topics/:topic` list of points (title, status, mastery %, next review) → `/point/<id>`.
- Point page: title, topic, type, status, mastery, next review, history table (date, kind, ok, q, why), past attempts from `/api/attempts`, "Open lesson in Obsidian", source links (Obsidian URLs), "Study now".
- Progress page: `react-activity-calendar` heatmap from `activityByDay` (from 2026-10-07 to today), streak, "mastered / total", 14-day forecast bars (plain divs), pace line ("About N new points a day to finish 4 weeks before the interview").
- Settings page: new points per day (1–10), English feedback toggle, vault path (read-only), Claude status from `/api/health`.

- [ ] **Step 1: Write failing tests:** `stats.test.ts` — `streak counts back from today`, `streak allows today to be empty`, `forecast puts overdue on today`, `pace with 238 remaining and 77 days left gives 5 per day` (77 − 28 = 49 days → ceil(238/49) = 5), `topicSummary follows topic order`. `pages.test.tsx` — `topics page shows counts`, `point page shows history`, `settings saves new per day`.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Implement. **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat: topics, point, progress and settings pages`.

### Task 14: README and end-to-end check

**Files:**
- Create: `README.md`

- [ ] **Step 1:** Write `README.md` in the style of algorithm-learner: what it does, how it works (diagram: vault ↔ tutor.py ↔ server ↔ claude -p; UI), getting started (`tutor.config.json`, `npm install`, `npm run dev`), stable copy commands, development commands, path table.
- [ ] **Step 2:** `npm test && npm run typecheck` → all PASS.
- [ ] **Step 3: Manual check on the real vault** (with Khue): `npm run stable:build`, install the LaunchAgent per `docs/stable-deploy.md`, log out/in or `launchctl kickstart`, open `http://localhost:4175`. Study 2–3 real points (one learn, the due review). Then: Obsidian `Tutor/Dashboard.md` shows the same status; `python3 .claude/skills/tutor/scripts/tutor.py validate` in the vault reports no mismatch; `tail ~/Library/Logs/tutor-learner.log` shows `claude` ran from the LaunchAgent without an auth error.
- [ ] **Step 4:** Commit `docs: readme`.
