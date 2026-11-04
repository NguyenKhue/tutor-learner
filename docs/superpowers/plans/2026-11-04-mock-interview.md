# Mock interview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A mock interview that runs like a real hiring process: set up from a JD, level and rounds; an interviewer that reads questions aloud and follows up; spoken answers; a report at the end; history, weak spots across sessions and re-asking weak questions.

**Architecture:** A new `server/interview/` module (prompts, vault context, service) on top of the existing `runClaude`, speech service and state-store pattern, with its own `interviews.json`. Claude runs with no tools, except the optional research step, which may use `WebSearch` only. The client adds an Interview section (list, setup, session, report, weak spots) that reuses `AnswerBox`.

**Tech Stack:** Node 22, TypeScript, Vite 5, React 18, react-router 6, vitest + Testing Library, `claude -p`, Whisper (`speech.ts`), browser `speechSynthesis`.

**Spec:** `docs/superpowers/specs/2026-11-04-mock-interview-design.md`

## Global Constraints

- Interviews are in **English**; the app UI stays in English like the rest of the app.
- Levels: `'mid' | 'senior' | 'lead'`. Rounds, in this fixed order: `'hr' | 'technical' | 'system_design' | 'behavioral'`.
- Main questions per round: `hr: 5, technical: 5, system_design: 4` (one design problem in 4 steps), `behavioral: 4`.
- At most **2 follow-ups** per main question, enforced by the server.
- No feedback, scores or hints during a session; feedback only in the report.
- Score dimensions, each 1–4: `reasoning, depth, structure, english, length`.
- A weak question (reasoning ≤ 2 or depth ≤ 2) may be re-asked after **≥ 3 days**, at most **2 per round** of the same kind.
- A weak spot is "recurring" when it appears in **≥ 2 sessions**.
- Recordings keep the existing **30-day** removal; text, scores and reports are kept forever.
- Web research only when the setup asks for it, only in the research step, with `--tools WebSearch --allowedTools WebSearch`; every other Claude call keeps `--tools ""`. Research items always carry a URL.
- Nothing is written to the vault; Tutor history, scores and Today are unchanged. A mock interview does not count toward Today or the streak.
- An answer is saved before any Claude call; any failure leaves a retry, never a lost answer.
- Same HTTP rules as today: `localhost` only, POST must come from the same Origin.
- Tests never call the real `claude`, never touch the real vault.

## Review Focus

- **Double press on Send answer** (two answers in flight for one session): the second request gets `409` and the first answer is the only one saved. Test in Task 6.
- **Server restart while a session is `researching`, `planning`, `thinking` or `reporting`**: on the next read the session shows `error.code = 'failed'` with **Try again**, not a spinner forever. Test in Task 5.
- **Claude returns a plan with the wrong rounds, wrong counts or an empty rubric**: no plan is saved, the session shows an error with **Try again**. Test in Task 3.
- **Web research fails or returns nothing**: the session moves to review with an empty list and a message, and **Start** works without web. Test in Task 5.
- **Report older than 30 days**: recordings are gone; the report shows "Recording removed after 30 days" instead of a broken player. Test in Task 10.

---

### Task 1: Level rubric draft (checkpoint with Khue)

**Files:**
- Create: `server/interview/rubric.ts`
- Create: `docs/superpowers/specs/2026-11-04-level-rubric-sources.md`

**Interfaces:**
- Produces: `export const LEVEL_RUBRIC: Record<'mid' | 'senior' | 'lead', string[]>` — 5–8 plain-English expectations per level, cumulative in meaning (senior assumes mid, lead assumes senior).

- [ ] **Step 1: Research** public descriptions of how companies assess Android engineers at mid, senior and lead/staff level (engineering ladders, interview rubrics published by companies, well-known interview guides). Record each source with its URL and one line on what it says in the sources doc.
- [ ] **Step 2: Write `LEVEL_RUBRIC`** from those sources only, each line one observable expectation ("explains the trade-off and the cost of the chosen option", "names how to measure the result").
- [ ] **Step 3: Stop and ask Khue to approve the rubric and the sources** before Task 3. Apply the changes Khue asks for.
- [ ] **Step 4: Commit**

```bash
git add server/interview/rubric.ts docs/superpowers/specs/2026-11-04-level-rubric-sources.md
git commit -m "feat(interview): level rubric for mock interviews"
```

### Task 2: Foundations — types, interview store, backups, Claude tools option

**Files:**
- Modify: `src/lib/types.ts` (append the interview types)
- Modify: `server/state.ts` (extract a generic JSON store)
- Create: `server/interview/store.ts`
- Modify: `server/backups.ts`, `server/main.ts:103-110`
- Modify: `server/claude.ts:20-45`
- Test: `server/state.test.ts`, `server/interview/store.test.ts`, `server/backups.test.ts`, `server/claude.test.ts`

**Interfaces:**
- Produces, in `src/lib/types.ts`:

```ts
export type Level = 'mid' | 'senior' | 'lead'
export type RoundKind = 'hr' | 'technical' | 'system_design' | 'behavioral'
export interface InterviewSetup { source: string; level: Level; rounds: RoundKind[]; topics: string[]; web: boolean; readAloud: boolean }
export interface ResearchItem { kind: 'company' | 'process' | 'knowledge'; text: string; url: string; kept: boolean }
export interface PlannedQuestion { q: string; prompt: string; type: 'scenario' | 'tradeoff' | 'design' | 'behavioral' | 'hr'
  source: { vault?: string; url?: string }; rubric: Record<Level, string[]>; probes: string[]; reask?: string }
export interface PlannedRound { kind: RoundKind; persona: string; intro: string; competencies: string[]; questions: PlannedQuestion[] }
export interface Turn { round: number; q: string; from: 'interviewer' | 'candidate'; text: string; voice?: Voice; skipped?: boolean; at: string }
export interface Scores { reasoning: number; depth: number; structure: number; english: number; length: number }
export interface QuestionReport { q: string; scores: Scores; missed: string[]; sample: string; englishNotes: string[] }
export interface WeakSpot { kind: 'content' | 'level' | 'english' | 'delivery'; key: string; label: string }
export interface InterviewReport { levelMet: boolean; summary: string; questions: QuestionReport[]
  topFixes: { title: string; example: string; action: string }[]
  nextSteps: { notes: string[]; topics: string[]; drills: string[]; gaps: { topic: string; url: string }[]; focus: string }
  weakSpots: WeakSpot[] }
export interface Practice { q: string; answer: string; voice?: Voice; at: string; result?: QuestionReport; error?: { code: 'limit' | 'auth' | 'failed'; message: string } }
export type InterviewState = 'researching' | 'review' | 'planning' | 'running' | 'thinking' | 'reporting' | 'done'
export interface InterviewSession { id: string; created: string; setup: InterviewSetup; research?: ResearchItem[]
  plan?: PlannedRound[]; turns: Turn[]; state: InterviewState; current?: { round: number; q: string; followups: number }
  report?: InterviewReport; practice: Practice[]; error?: { code: 'limit' | 'auth' | 'failed'; message: string } }
export interface InterviewsFile { version: 1; sessions: InterviewSession[] }
export interface NoteExcerpt { path: string; title: string; text: string }
```

- Produces, in `server/state.ts`: `export function createJsonStore<T>(file: string, empty: () => T, validate: (v: unknown) => T): { read(): Promise<T>; update<R>(fn: (s: T) => R | Promise<R>): Promise<R> }`; `createStateStore` becomes a thin wrapper with unchanged behavior.
- Produces, in `server/interview/store.ts`: `export function createInterviewStore(file: string)` returning the same `read`/`update` shape over `InterviewsFile` (empty `{ version: 1, sessions: [] }`).
- Produces, in `server/backups.ts`: `runBackups(file: string, backupsDir: string, now: number, prefix = 'state')`; backup names become `${prefix}-YYYY-MM-DD.json`. `main.ts` backs up `interviews.json` with prefix `interviews` next to `state.json`.
- Produces, in `server/claude.ts`: `RunClaudeOptions.tools?: string[]` (default `[]`). Non-empty → args `--tools <names joined by ','> --allowedTools <same>`; empty → `--tools ''` as today.

- [ ] **Step 1: Write the failing tests**
  - `state.test.ts`: existing tests still pass through `createStateStore`; add `createJsonStore keeps a corrupt file aside and starts empty` with a custom `empty`.
  - `store.test.ts`: `starts with no sessions`, `persists a session across stores`.
  - `backups.test.ts`: `backs up interviews.json with its own prefix and prunes only that prefix` (create `state-…` and `interviews-…` files; pruning one prefix never removes the other).
  - `claude.test.ts`: `passes WebSearch as the only tool when asked` (fake CLI records argv; expect `--tools`, `WebSearch`, `--allowedTools`, `WebSearch`) and `keeps --tools empty by default`.
- [ ] **Step 2: Run** `npx vitest run server/state.test.ts server/interview/store.test.ts server/backups.test.ts server/claude.test.ts` — expected: the new tests FAIL.
- [ ] **Step 3: Implement** the interfaces above.
- [ ] **Step 4: Run** the same command, then `npx tsc --noEmit` — expected: all PASS, no type errors.
- [ ] **Step 5: Commit** `feat(interview): types, interview store, backups and Claude tools option`.

### Task 3: Prompts and validators

**Files:**
- Create: `server/interview/prompts.ts`
- Test: `server/interview/prompts.test.ts`

**Interfaces:**
- Consumes: `LEVEL_RUBRIC` (Task 1), types (Task 2).
- Produces:
  - `export const ROUND_SIZE: Record<RoundKind, number> = { hr: 5, technical: 5, system_design: 4, behavioral: 4 }`
  - `export const MAX_FOLLOWUPS = 2`
  - Schemas: `RESEARCH_SCHEMA`, `PLAN_SCHEMA`, `TURN_SCHEMA`, `REPORT_SCHEMA`, `PRACTICE_SCHEMA` (JSON Schema objects in the style of `server/prompts.ts`; field names exactly as the types in Task 2, without the server-assigned `q`, `kept`).
  - `buildResearchPrompt(a: { setup: InterviewSetup; vaultTopics: string[] }): string`
  - `buildPlanPrompt(a: { setup: InterviewSetup; notes: NoteExcerpt[]; research: ResearchItem[]; avoid: string[]; reask: { round: RoundKind; prompt: string }[] }): string`
  - `buildTurnPrompt(a: { round: PlannedRound; question: PlannedQuestion; turns: Turn[]; followups: number; level: Level; lastRound: boolean; lastQuestion: boolean }): string`
  - `buildReportPrompt(a: { setup: InterviewSetup; plan: PlannedRound[]; turns: Turn[]; knownWeakKeys: string[] }): string`
  - `buildPracticePrompt(a: { question: PlannedQuestion; level: Level; answer: string; spoken: boolean }): string`
  - `validatePlan(raw: unknown, setup: InterviewSetup): PlannedRound[]` — throws `Error` unless the rounds are exactly `setup.rounds` in order, each round has exactly `ROUND_SIZE[kind]` questions, and every question has a non-empty prompt, at least one rubric line for `setup.level`, and a `source` with `vault` or `url`. Assigns `q = \`${roundIndex}-${questionIndex}\``.
  - `validateTurn(raw: unknown, followups: number): { say: string; action: 'followup' | 'next' | 'end_round' }` — turns `followup` into `next` when `followups >= MAX_FOLLOWUPS`.
  - `validateResearch(raw: unknown): ResearchItem[]` — drops items without an `http(s)` URL; sets `kept: true`.
  - `validateReport(raw: unknown, plan: PlannedRound[]): InterviewReport` — keeps only question reports whose `q` exists in the plan, clamps scores to 1–4, at most 3 `topFixes`.
- Prompt content the tests pin: every prompt says the interview is in English; Plan includes `LEVEL_RUBRIC[setup.level]`, the JD text, each note excerpt with its path, the `avoid` list, and "questions must need applied reasoning, not definitions"; Turn includes the rubric and probes but says "never reveal the rubric, never teach, never praise or criticise"; Turn and Report include, for spoken answers, the same sentence `server/prompts.ts` uses for speech ("A word may be misheard…"); Report includes `knownWeakKeys` with "reuse a key when the weakness is the same".

- [ ] **Step 1: Write the failing tests** in `prompts.test.ts`:
  - `plan prompt carries the JD, the level rubric, the notes and the questions to avoid`
  - `turn prompt hides the rubric from the candidate and forbids teaching`
  - `validatePlan rejects a plan with a missing round, a wrong count or an empty rubric` (three cases, each `toThrow`)
  - `validatePlan numbers questions by round and position` (`'0-0'`, `'1-3'`)
  - `validateTurn stops follow-ups after two` (`validateTurn({ say: 'x', action: 'followup' }, 2).action === 'next'`)
  - `validateResearch drops items without a link`
  - `validateReport clamps scores and keeps at most three fixes`
- [ ] **Step 2: Run** `npx vitest run server/interview/prompts.test.ts` — expected FAIL.
- [ ] **Step 3: Implement** `server/interview/prompts.ts`.
- [ ] **Step 4: Run** the same command — expected PASS.
- [ ] **Step 5: Commit** `feat(interview): prompts, schemas and validators`.

### Task 4: Vault context

**Files:**
- Create: `server/interview/context.ts`
- Test: `server/interview/context.test.ts`

**Interfaces:**
- Consumes: `readNoteText(vault, rel)` and `CatalogEntry` from the Reading module; `NoteExcerpt` from types (Task 2).
- Produces:
  - `export const CONTEXT_BUDGET = 40_000` (characters) and `export const EXCERPT_CHARS = 4_000`
  - `buildVaultContext(vault: string, catalog: Record<string, CatalogEntry>, topics: string[], budget = CONTEXT_BUDGET): NoteExcerpt[]` — notes whose `topic` is in `topics` and `present`, priority order `high`, `medium`, `low` (never `skip`), each cut to `EXCERPT_CHARS` with the frontmatter stripped, stopping before the total passes `budget`.

- [ ] **Step 1: Write the failing tests** with `makeTestVault`:
  - `takes notes of the chosen topics, high priority first`
  - `never takes skipped or missing notes`
  - `stops at the budget and cuts long notes`
- [ ] **Step 2: Run** `npx vitest run server/interview/context.test.ts` — expected FAIL.
- [ ] **Step 3: Implement** `buildVaultContext`.
- [ ] **Step 4: Run** — expected PASS.
- [ ] **Step 5: Commit** `feat(interview): vault context for interview plans`.

### Task 5: Interview service — create, research, plan

**Files:**
- Create: `server/interview/service.ts`
- Test: `server/interview/service.test.ts`

**Interfaces:**
- Consumes: Tasks 2–4; `ReadingService`-style deps.
- Produces:

```ts
export interface InterviewDeps {
  vault: string
  store: ReturnType<typeof createInterviewStore>
  readCatalog: () => Promise<Record<string, CatalogEntry>>
  claude: <T>(prompt: string, schema: object) => Promise<T>
  claudeWeb: <T>(prompt: string, schema: object) => Promise<T>
  today: () => string
  newId?: () => string
}
export interface InterviewService {
  list(): Promise<InterviewSession[]>            // newest first
  get(id: string): Promise<InterviewSession>
  create(setup: InterviewSetup): Promise<InterviewSession>          // starts research or planning in the background
  keepResearch(id: string, kept: number[]): Promise<InterviewSession> // indexes of research items to keep, then plans
  answer(id: string, text: string, voice?: Voice): Promise<InterviewSession>   // Task 6
  skip(id: string): Promise<InterviewSession>                                  // Task 6
  retry(id: string): Promise<InterviewSession>                                 // Task 6
  finish(id: string): Promise<InterviewSession>                                // Task 7
  practice(id: string, q: string, text: string, voice?: Voice): Promise<InterviewSession> // Task 7
  weakSpots(): Promise<WeakSpotSummary[]>                                      // Task 7
}
export class InterviewError extends Error { constructor(public code: 'bad-state' | 'not-found' | 'busy', message: string) }
```

- Behavior:
  - `create` validates the setup (non-empty `rounds`, valid level), saves a session in `researching` (when `web`) or `planning`, and runs the step in the background; the returned session is the saved one.
  - Research uses `claudeWeb` with `RESEARCH_SCHEMA`; success → state `review` with the items; failure or zero items → state `review`, `research: []`, `error` set with the message (Review Focus).
  - Planning uses `claude` with `PLAN_SCHEMA`, `avoid` = prompts of the last 60 main questions across done sessions, `reask` from `reaskQueue` (Task 7, exported as a pure function so this task can call it; stub returns `[]` until Task 7). On success: `plan` saved, state `running`, the first interviewer turn = round 0 `intro` + `\n\n` + first question prompt, `current = { round: 0, q: '0-0', followups: 0 }`.
  - Any Claude error → keep the state's input, set `error` (code from `ClaudeError`, else `failed`).
  - **Stuck states:** an in-memory set tracks running jobs; `get`/`list` report a session in `researching | planning | thinking | reporting` with no job running as `error: { code: 'failed', message: 'Stopped before finishing. Try again.' }` (Review Focus).

- [ ] **Step 1: Write the failing tests** (fake `claude`/`claudeWeb`, temp store):
  - `create without web plans and opens with the first question of the first round`
  - `create with web goes to review with the found items, and keepResearch plans with only the kept ones`
  - `failed or empty research still lets the interview start without web`
  - `an invalid plan is not saved and leaves an error to retry`
  - `the plan avoids questions asked in earlier sessions` (assert the prompt passed to `claude` contains an earlier prompt)
  - `a session stuck in planning after a restart shows a retryable error` (new service over the same store file)
- [ ] **Step 2: Run** `npx vitest run server/interview/service.test.ts` — expected FAIL.
- [ ] **Step 3: Implement** `create`, `keepResearch`, `list`, `get` and the background runner.
- [ ] **Step 4: Run** — expected PASS.
- [ ] **Step 5: Commit** `feat(interview): create, research and plan sessions`.

### Task 6: Interview service — answers, follow-ups, skip, retry

**Files:**
- Modify: `server/interview/service.ts`
- Test: `server/interview/service.test.ts`

**Interfaces:**
- Consumes: Task 5 service internals; `buildTurnPrompt`, `validateTurn`, `TURN_SCHEMA`, `MAX_FOLLOWUPS`.
- Behavior:
  - `answer` requires state `running`, non-empty `text` (trimmed, max 8 000 characters → `InterviewError('bad-state')` beyond), saves the candidate turn **before** calling Claude, sets state `thinking`, then applies the Turn result:
    - `followup` → interviewer turn `say`, `followups + 1`.
    - `next` → interviewer turn `say` + `\n\n` + the next question prompt; `followups = 0`. On the round's last question, `next` acts as `end_round`.
    - `end_round` → interviewer turn `say` + `\n\n` + next round `intro` + `\n\n` + its first question; on the last round, the closing `say` only and state stays `running` with `current` cleared, so the client shows **Finish**.
  - A second `answer`/`skip` while a turn is running → `InterviewError('busy')` (HTTP 409) (Review Focus).
  - `skip` records a candidate turn with `skipped: true`, text `''`, and moves to the next question without calling Claude.
  - `retry` reruns whatever step failed (research, plan, turn, report) from the saved input.

- [ ] **Step 1: Write the failing tests**:
  - `an answer is saved before Claude runs and kept when Claude fails` (fake claude throws `ClaudeError('limit')`; session has the candidate turn and `error.code === 'limit'`; `retry` then succeeds)
  - `follow-ups stop after two and the interview moves on` (fake always returns `followup`; third answer yields the next planned prompt)
  - `the last question of a round opens the next round with its intro`
  - `the last answer of the last round leaves the session ready to finish`
  - `a second answer while one is being handled is refused as busy`
  - `skip moves on without calling Claude`
  - `an empty or over-long answer is refused`
- [ ] **Step 2: Run** `npx vitest run server/interview/service.test.ts` — expected the new tests FAIL.
- [ ] **Step 3: Implement** `answer`, `skip`, `retry`.
- [ ] **Step 4: Run** — expected PASS.
- [ ] **Step 5: Commit** `feat(interview): answers, follow-ups, skip and retry`.

### Task 7: Interview service — report, practice, re-ask queue, weak spots

**Files:**
- Create: `server/interview/history.ts`
- Modify: `server/interview/service.ts`
- Test: `server/interview/history.test.ts`, `server/interview/service.test.ts`

**Interfaces:**
- Produces, in `history.ts` (pure functions over `InterviewSession[]`):
  - `reaskQueue(sessions: InterviewSession[], today: string, rounds: RoundKind[]): { round: RoundKind; prompt: string }[]` — main questions from reports with `reasoning <= 2 || depth <= 2`, session at least 3 days before `today`, not followed by a later report of a re-ask of the same prompt scoring ≥ 3 on both; at most 2 per round kind in `rounds`, oldest first.
  - `export interface WeakSpotSummary { key: string; kind: WeakSpot['kind']; label: string; sessions: number; lastSeen: string; trend: 'still' | 'improving' }`
  - `summarizeWeakSpots(sessions: InterviewSession[]): WeakSpotSummary[]` — only keys seen in ≥ 2 done sessions; `trend = 'improving'` when absent from the newest done session, else `'still'`; sorted by `sessions` desc.
  - `knownWeakKeys(sessions): string[]` — all keys ever reported.
- Service behavior:
  - `finish` works from `running` (also mid-interview: "End interview"), sets `reporting`, calls Claude with `REPORT_SCHEMA` and `knownWeakKeys`, saves `report`, state `done`. Reports cover answered questions only.
  - `practice` requires state `done` and a `q` in the plan; saves a `Practice` entry before calling Claude with `PRACTICE_SCHEMA`; a failure stays on that entry with `error`.
  - Task 5's planning now calls the real `reaskQueue`; planned questions coming from the queue carry `reask` = the original prompt.

- [ ] **Step 1: Write the failing tests**:
  - `history.test.ts`: `re-asks weak questions after three days, two per round at most`; `a re-ask that scored well leaves the queue`; `weak spots count sessions and show improving when gone from the latest`; `a weak spot seen once is not recurring`.
  - `service.test.ts`: `finish reports on answered questions and passes known weak keys`; `ending early reports what was answered`; `practice saves the answer first and keeps it when grading fails`; `planning puts due re-asks into the plan`.
- [ ] **Step 2: Run** `npx vitest run server/interview` — expected the new tests FAIL.
- [ ] **Step 3: Implement** `history.ts`, `finish`, `practice`, `weakSpots`, and wire `reaskQueue` into planning.
- [ ] **Step 4: Run** — expected PASS.
- [ ] **Step 5: Commit** `feat(interview): reports, practice, re-asks and weak spots`.

### Task 8: API routes

**Files:**
- Modify: `server/api.ts`
- Test: `server/api.test.ts`

**Interfaces:**
- Consumes: `InterviewService` (Tasks 5–7); `runClaude` `tools` option (Task 2).
- Produces routes exactly as spec §4.10:

| Route | Body / query | Calls |
|---|---|---|
| `GET /api/interviews` | | `list()` |
| `POST /api/interview` | `InterviewSetup` | `create` |
| `POST /api/interview/research` | `{ id, kept: number[] }` | `keepResearch` |
| `GET /api/interview` | `?id=` | `get` |
| `POST /api/interview/answer` | `{ id, text, voice? }` | `answer` |
| `POST /api/interview/skip` | `{ id }` | `skip` |
| `POST /api/interview/retry` | `{ id }` | `retry` |
| `POST /api/interview/finish` | `{ id }` | `finish` |
| `POST /api/interview/practice` | `{ id, q, text, voice? }` | `practice` |
| `GET /api/interview/weak-spots` | | `weakSpots()` |

- `ApiDeps` gains `claudeWeb?`; the default runs `runClaude` with `tools: ['WebSearch']` and `timeoutMs: 180_000`. The interview store file is `<dataDir>/interviews.json`. `InterviewError` maps `not-found → 404`, `busy → 409`, `bad-state → 409`; setup validation errors → `400` (`rounds` empty or unknown, level unknown, `source` over 20 000 characters, `topics` not strings). `voice` reuses `voiceOf`.

- [ ] **Step 1: Write the failing tests** in `api.test.ts` with fake `claude`/`claudeWeb`:
  - `a mock interview runs from setup to report over HTTP`
  - `a bad setup is refused with 400`
  - `answering twice at once returns 409 for the second`
  - `interview routes refuse another origin`
- [ ] **Step 2: Run** `npx vitest run server/api.test.ts` — expected FAIL.
- [ ] **Step 3: Implement** the routes and dependency wiring.
- [ ] **Step 4: Run** `npx vitest run server` and `npx tsc --noEmit` — expected PASS.
- [ ] **Step 5: Commit** `feat(interview): HTTP routes`.

### Task 9: Client — Interview list and setup

**Files:**
- Create: `src/lib/interview.ts`, `src/pages/InterviewsPage.tsx`, `src/pages/InterviewSetupPage.tsx`
- Modify: `src/app/App.tsx`, `src/app/Layout.tsx`, `src/styles/app.css`
- Test: `src/lib/interview.test.ts`, `src/pages/interview.test.tsx`

**Interfaces:**
- Produces, in `src/lib/interview.ts`:
  - `ROUND_LABEL: Record<RoundKind, string> = { hr: 'HR', technical: 'Technical', system_design: 'System design', behavioral: 'Behavioral / Lead' }`
  - `defaultTopics(source: string, topicOrder: string[], points: Point[]): string[]` — topics whose name words (≥ 4 letters, case-insensitive) appear in `source`; when none match, topics with at least one point not `new`.
- Routes: `/interview` (list), `/interview/new` (setup), `/interview/:id` (session or report by state), `/interview/weak-spots`. Nav gains **Interview** after Progress (the gear stays last).
- List page: newest first, each row date, first line of source (or "No job description"), level, rounds, and verdict when done; primary **New mock interview**; link **Weak spots**.
- Setup page: textarea "Job description or notes", level buttons (Mid/Senior/Lead, default Senior), round checkboxes (all four on), topic chips pre-selected by `defaultTopics` on blur of the textarea, toggles "Search the web" (off) and "Read questions aloud" (on), primary **Prepare interview** → `POST /api/interview` → navigate to `/interview/:id`.

- [ ] **Step 1: Write the failing tests**:
  - `defaultTopics matches topic words in the job description and falls back to started topics`
  - `the list shows past interviews newest first and links to a new one`
  - `setup sends the chosen level, rounds, topics and toggles` (assert the POST body)
  - `nav has Interview`
- [ ] **Step 2: Run** `npx vitest run src/lib/interview.test.ts src/pages/interview.test.tsx` — expected FAIL.
- [ ] **Step 3: Implement** the pages, routes and nav.
- [ ] **Step 4: Run** — expected PASS; also check the nav still fits at 375 px wide (no horizontal scroll) in the browser.
- [ ] **Step 5: Commit** `feat(interview): list and setup pages`.

### Task 10: Client — session, read-aloud, report, practice, weak spots

**Files:**
- Create: `src/lib/speak.ts`, `src/pages/InterviewPage.tsx`, `src/components/InterviewReport.tsx`, `src/pages/WeakSpotsPage.tsx`
- Modify: `src/styles/app.css`, `README.md`
- Test: `src/lib/speak.test.ts`, `src/pages/interview.test.tsx`

**Interfaces:**
- Consumes: routes (Task 8), `AnswerBox`, `Working`/`Skeleton`, `clock`/`lengthNote`.
- Produces, in `src/lib/speak.ts`: `pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null` (first `en-US`/`en-GB` voice whose name has "Premium" or "Enhanced", else first `en-US`, else first `en-*`, else null) and `speak(text: string): void` (cancels any current speech; no-op without `speechSynthesis`).
- Session page by state:
  - `researching` / `planning` / `thinking` / `reporting`: `Working` with "Searching the web" / "Preparing your interview" / "The interviewer is thinking" / "Writing your report"; poll `GET /api/interview` every 2 s.
  - `review`: the research items as a list with checkboxes and their links, message when empty, **Start interview**.
  - `running`: header "Technical · question 2 of 5"; the last interviewer turn (read aloud when `readAloud`, **Play again**, toggle **Hide text until I answer**); `AnswerBox` with `hint` = round label + JD first line; **Send answer** (disabled while speech busy or empty), **Skip question**, **End interview** (confirm); when `current` is cleared, a single **Finish** that calls finish.
  - `done`: `InterviewReport`.
  - `error`: message + **Try again** (`POST /api/interview/retry`).
- Report: verdict and summary; the 3 fixes with example and action; per round, per question: the prompt, the candidate's answers with a player (or "Recording removed after 30 days" when the session `created` is more than 30 days before today — Review Focus), the 5 scores, missed points, sample answer (folded), English notes, and **Practice again** opening an `AnswerBox` whose result shows next to the original; next steps with links (`/read/<note>` for vault notes, `/topics/<topic>`, external gap links with `rel="noreferrer"`).
- Weak spots page: rows with label, kind, "seen in N interviews", last seen, **Improving** / **Still there**; empty state "Do two interviews to see patterns."
- README: a "Mock interview" bullet in "What it does".

- [ ] **Step 1: Write the failing tests**:
  - `speak.test.ts`: `prefers an enhanced English voice`; `falls back to any English voice`; `does nothing without speech synthesis`.
  - `interview.test.tsx`: `a running interview reads the question aloud and sends the answer`; `review lets you drop research items before starting`; `a failed step offers Try again`; `the report shows scores, fixes and practice again`; `recordings older than 30 days show a note instead of a player`; `weak spots show improving and still there`.
- [ ] **Step 2: Run** `npx vitest run src/lib/speak.test.ts src/pages/interview.test.tsx` — expected FAIL.
- [ ] **Step 3: Implement** the pages, report, read-aloud and styles (same design rules as the app: one main action per screen, sentence-case labels, 44 px targets, reduced motion respected).
- [ ] **Step 4: Run** `npx vitest run` and `npx tsc --noEmit` — expected all PASS.
- [ ] **Step 5: Commit** `feat(interview): session, report, practice and weak spots`.

### Task 11: Real trial and stable update

**Files:** none new.

- [ ] **Step 1:** Start the dev server on a copy of the stable data (as in earlier checks: copy `state.json` into `.data/`, `TUTOR_NO_PREFETCH=1`).
- [ ] **Step 2:** Run one short real interview: Senior, HR round only, web off, with the real `claude` and Whisper. Expected: plan in about 30 s, follow-ups appear, report renders; note the real timings.
- [ ] **Step 3:** Run setup once with web on and check the research items have links and the session starts.
- [ ] **Step 4:** Check the pages at 375 px and in light and dark themes; no console errors.
- [ ] **Step 5:** Ask Khue before committing anything left, updating stable (`npm run stable:update`) and pushing.
