import type { CatalogEntry, InterviewSession, InterviewSetup, PlannedRound, ResearchItem, RoundKind, Voice } from '../../src/lib/types'
import { ClaudeError } from '../claude'
import { buildVaultContext } from './context'
import { knownWeakKeys, reaskQueue, summarizeWeakSpots, type WeakSpotSummary } from './history'
import {
  PLAN_SCHEMA, PRACTICE_SCHEMA, REPORT_SCHEMA, RESEARCH_SCHEMA, TURN_SCHEMA,
  buildPlanPrompt, buildPracticePrompt, buildReportPrompt, buildResearchPrompt, buildTurnPrompt,
  cleanQuestionReport, validatePlan, validateReport, validateResearch, validateTurn,
} from './prompts'
import type { createInterviewStore } from './store'

const ROUND_ORDER: RoundKind[] = ['hr', 'technical', 'system_design', 'behavioral']
const LEVELS = ['mid', 'senior', 'lead']
const AVOID_LIMIT = 60
const MAX_ANSWER = 8000
const WORKING = ['researching', 'planning', 'thinking', 'reporting']

export interface InterviewDeps {
  vault: string
  store: ReturnType<typeof createInterviewStore>
  readCatalog: () => Promise<Record<string, CatalogEntry>>
  claude: <T>(prompt: string, schema: object) => Promise<T>
  /** Like `claude`, with a longer timeout and fewer retries; used only for the plan and the report. */
  claudeLong: <T>(prompt: string, schema: object) => Promise<T>
  claudeWeb: <T>(prompt: string, schema: object) => Promise<T>
  today: () => string
  newId?: () => string
}

export interface InterviewService {
  list(): Promise<InterviewSession[]>
  get(id: string): Promise<InterviewSession>
  create(setup: InterviewSetup): Promise<InterviewSession>
  keepResearch(id: string, kept: number[]): Promise<InterviewSession>
  answer(id: string, text: string, voice?: Voice): Promise<InterviewSession>
  skip(id: string): Promise<InterviewSession>
  retry(id: string): Promise<InterviewSession>
  finish(id: string): Promise<InterviewSession>
  practice(id: string, q: string, text: string, voice?: Voice): Promise<InterviewSession>
  weakSpots(): Promise<WeakSpotSummary[]>
  /** Resolves when no background job is running. For tests and shutdown only. */
  idle(): Promise<void>
}

export class InterviewError extends Error {
  constructor(
    public code: 'bad-state' | 'not-found' | 'busy',
    message: string,
  ) {
    super(message)
  }
}

const errorOf = (e: unknown): NonNullable<InterviewSession['error']> =>
  e instanceof ClaudeError
    ? { code: e.code, message: e.message }
    : { code: 'failed', message: e instanceof Error ? e.message : String(e) }

/** Mock interviews: creating, researching and planning sessions. Writes only interviews.json, never the vault. */
export function createInterviewService(deps: InterviewDeps): InterviewService {
  const { vault, store, readCatalog, claude, claudeLong, claudeWeb, today } = deps
  const newId = deps.newId ?? (() => crypto.randomUUID())
  const running = new Map<string, symbol>()
  const jobs = new Set<Promise<void>>()

  /**
   * Runs one background job per session. `work` gets a `release` it must call inside its final store update, so the
   * session never shows a finished state while still marked running. Throws `busy` when a job is already in flight.
   */
  function background(id: string, work: (release: () => void) => Promise<void>) {
    if (running.has(id)) throw new InterviewError('busy', 'Still working.')
    const token = Symbol(id)
    running.set(id, token)
    const release = () => {
      if (running.get(id) === token) running.delete(id)
    }
    const job = work(release)
      .catch((e) => console.warn(`[interview] background job for ${id} failed: ${e instanceof Error ? e.message : e}`))
      .finally(() => {
        release()
        jobs.delete(job)
      })
    jobs.add(job)
  }

  /** A session that claims to be working but has no job (after a restart) is shown as a retryable error. */
  function shown(s: InterviewSession): InterviewSession {
    if (WORKING.includes(s.state) && !running.has(s.id) && !s.error) {
      return { ...s, error: { code: 'failed', message: 'Stopped before finishing. Try again.' } }
    }
    // A practice answer still ungraded with no job lost its grader in a restart: show it as failed.
    if (s.state === 'done' && !running.has(s.id) && s.practice.some((p) => !p.result && !p.error)) {
      return { ...s, practice: s.practice.map((p) => (p.result || p.error ? p : { ...p, error: { code: 'failed' as const, message: 'Stopped before finishing. Try again.' } })) }
    }
    return s
  }

  async function patch(id: string, fn: (s: InterviewSession) => void) {
    await store.update((f) => {
      const s = f.sessions.find((x) => x.id === id)
      if (s) fn(s)
    })
  }

  async function plan(id: string, release: () => void) {
    try {
      const file = await store.read()
      const s = file.sessions.find((x) => x.id === id)
      if (!s) return
      const catalog = await readCatalog()
      const reask = reaskQueue(file.sessions, today(), s.setup.rounds)
      const queued = new Set(reask.map((r) => r.prompt))
      const avoid = file.sessions
        .filter((x) => x.state === 'done')
        .flatMap((x) => (x.plan ?? []).flatMap((r) => r.questions.map((q) => q.prompt)))
        .filter((p) => !queued.has(p))
        .slice(-AVOID_LIMIT)
      const prompt = buildPlanPrompt({
        setup: s.setup,
        notes: buildVaultContext(vault, catalog, s.setup.topics),
        research: s.research ?? [],
        avoid,
        reask,
      })
      const raw = await claudeLong<unknown>(prompt, PLAN_SCHEMA)
      const rounds = validatePlan(raw, s.setup, reask.map((r) => r.prompt))
      await patch(id, (x) => {
        release()
        x.plan = rounds
        x.state = 'running'
        x.current = { round: 0, q: '0-0', followups: 0 }
        x.turns.push({ round: 0, q: '0-0', from: 'interviewer', text: `${rounds[0].intro}\n\n${rounds[0].questions[0].prompt}`, at: today() })
        delete x.error
      })
    } catch (e) {
      await patch(id, (x) => {
        release()
        x.error = errorOf(e)
      })
    }
  }

  async function research(id: string, release: () => void) {
    try {
      const file = await store.read()
      const s = file.sessions.find((x) => x.id === id)
      if (!s) return
      const catalog = await readCatalog()
      const vaultTopics = [...new Set(Object.values(catalog).map((e) => e.topic).filter((t): t is string => Boolean(t)))]
      const raw = await claudeWeb<unknown>(buildResearchPrompt({ setup: s.setup, vaultTopics }), RESEARCH_SCHEMA)
      const items = validateResearch(raw)
      await patch(id, (x) => {
        release()
        x.research = items
        x.state = 'review'
        if (items.length === 0) x.error = { code: 'failed', message: 'No research found. You can start the interview without it.' }
        else delete x.error
      })
    } catch (e) {
      await patch(id, (x) => {
        release()
        x.research = []
        x.state = 'review'
        x.error = errorOf(e)
      })
    }
  }

  function cleanSetup(setup: InterviewSetup): InterviewSetup {
    const bad = (m: string) => new InterviewError('bad-state', m)
    if (!setup || typeof setup !== 'object') throw bad('Missing setup.')
    if (typeof setup.source !== 'string') throw bad('The job description must be text.')
    if (!Array.isArray(setup.topics) || setup.topics.some((t) => typeof t !== 'string')) throw bad('Topics must be a list of text.')
    if (typeof setup.web !== 'boolean' || typeof setup.readAloud !== 'boolean') throw bad('web and readAloud must be true or false.')
    if (!Array.isArray(setup.rounds) || setup.rounds.length === 0) throw new InterviewError('bad-state', 'Choose at least one round.')
    if (setup.rounds.some((r) => !ROUND_ORDER.includes(r))) throw new InterviewError('bad-state', 'Unknown round.')
    if (!LEVELS.includes(setup.level)) throw new InterviewError('bad-state', 'Unknown level.')
    return {
      source: setup.source,
      level: setup.level,
      rounds: ROUND_ORDER.filter((r) => setup.rounds.includes(r)),
      topics: setup.topics,
      web: setup.web,
      readAloud: setup.readAloud,
    }
  }

  async function find(id: string): Promise<InterviewSession> {
    const s = (await store.read()).sessions.find((x) => x.id === id)
    if (!s) throw new InterviewError('not-found', 'Interview not found.')
    return s
  }

  /**
   * Moves the interview on after a question: the next question of the round, the next round (with its intro), or,
   * after the last round, nothing (state stays `running` with no `current`, so the client shows Finish).
   * `say` is the interviewer's line; it is joined to the next prompt only when it is not empty.
   */
  function moveOn(x: InterviewSession, say: string, action: 'next' | 'end_round') {
    const plan = x.plan ?? []
    const cur = x.current!
    const idx = Number(cur.q.split('-')[1])
    const join = (...parts: string[]) => parts.filter((p) => p !== '').join('\n\n')
    const speak = (round: number, q: string, text: string) => x.turns.push({ round, q, from: 'interviewer', text, at: today() })
    x.state = 'running'
    delete x.error
    if (action === 'next' && idx + 1 < plan[cur.round].questions.length) {
      const q = `${cur.round}-${idx + 1}`
      speak(cur.round, q, join(say, plan[cur.round].questions[idx + 1].prompt))
      x.current = { round: cur.round, q, followups: 0 }
    } else if (cur.round + 1 < plan.length) {
      const next = plan[cur.round + 1]
      const q = `${cur.round + 1}-0`
      speak(cur.round + 1, q, join(say, next.intro, next.questions[0].prompt))
      x.current = { round: cur.round + 1, q, followups: 0 }
    } else {
      if (say) speak(cur.round, cur.q, say)
      delete x.current
    }
  }

  /** Asks Claude for the interviewer's reply to the saved candidate answer, then applies it. Used by answer and retry. */
  async function turn(id: string, release: () => void) {
    try {
      const s = (await store.read()).sessions.find((x) => x.id === id)
      if (!s) return
      const cur = s.current
      const plan = s.plan
      if (!cur || !plan) throw new Error('The interview has no current question.')
      const round = plan[cur.round]
      const idx = Number(cur.q.split('-')[1])
      const prompt = buildTurnPrompt({
        round,
        question: round.questions[idx],
        turns: s.turns.filter((t) => t.round === cur.round),
        followups: cur.followups,
        level: s.setup.level,
        lastRound: cur.round === plan.length - 1,
        lastQuestion: idx === round.questions.length - 1,
      })
      const result = validateTurn(await claude<unknown>(prompt, TURN_SCHEMA), cur.followups, idx === round.questions.length - 1)
      await patch(id, (x) => {
        release()
        if (result.action === 'followup') {
          x.turns.push({ round: cur.round, q: cur.q, from: 'interviewer', text: result.say, at: today() })
          x.current = { ...cur, followups: cur.followups + 1 }
          x.state = 'running'
          delete x.error
        } else {
          moveOn(x, result.say, result.action)
        }
      })
    } catch (e) {
      await patch(id, (x) => {
        release()
        x.error = errorOf(e)
      })
    }
  }

  /** The plan cut down to the questions Khue answered (not skipped, not unasked). */
  function answeredPlan(s: InterviewSession): PlannedRound[] {
    const answered = new Set(s.turns.filter((t) => t.from === 'candidate' && !t.skipped && t.text.trim()).map((t) => t.q))
    return (s.plan ?? []).map((r) => ({ ...r, questions: r.questions.filter((q) => answered.has(q.q)) })).filter((r) => r.questions.length > 0)
  }

  /** Writes the report for the answered questions. Used by finish and retry. */
  async function report(id: string, release: () => void) {
    try {
      const file = await store.read()
      const s = file.sessions.find((x) => x.id === id)
      if (!s) return
      const plan = answeredPlan(s)
      const research = s.research ?? []
      const prompt = buildReportPrompt({ setup: s.setup, plan, turns: s.turns, knownWeakKeys: knownWeakKeys(file.sessions.filter((x) => x.id !== id)), research })
      const catalog = await readCatalog()
      const result = validateReport(await claudeLong<unknown>(prompt, REPORT_SCHEMA), plan, { topics: s.setup.topics, catalog, research })
      await patch(id, (x) => {
        release()
        x.report = result
        x.state = 'done'
        delete x.error
      })
    } catch (e) {
      await patch(id, (x) => {
        release()
        x.error = errorOf(e)
      })
    }
  }

  /** Grades the saved practice answer at `index`. The entry stays; a failure is stored on it. */
  async function grade(id: string, index: number, release: () => void) {
    try {
      const s = (await store.read()).sessions.find((x) => x.id === id)
      const entry = s?.practice[index]
      if (!s || !entry) return
      const round = s.plan?.find((r) => r.questions.some((q) => q.q === entry.q))
      const question = round?.questions.find((q) => q.q === entry.q)
      if (!round || !question) throw new Error('The question is not in this interview.')
      const prompt = buildPracticePrompt({ question, round: round.kind, level: s.setup.level, answer: entry.answer, spoken: Boolean(entry.voice), seconds: entry.voice?.seconds })
      const raw = await claude<unknown>(prompt, PRACTICE_SCHEMA)
      if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('feedback is not an object')
      const result = cleanQuestionReport({ ...(raw as Record<string, unknown>), q: entry.q })
      await patch(id, (x) => {
        release()
        x.practice[index].result = result
        delete x.practice[index].error
      })
    } catch (e) {
      await patch(id, (x) => {
        release()
        if (x.practice[index]) x.practice[index].error = errorOf(e)
      })
    }
  }

  function needRunning(x: InterviewSession | undefined): InterviewSession {
    if (!x) throw new InterviewError('not-found', 'Interview not found.')
    if (running.has(x.id)) throw new InterviewError('busy', 'Still working.')
    if (x.state !== 'running' || !x.current || !x.plan) throw new InterviewError('bad-state', 'This interview is not waiting for an answer.')
    return x
  }

  return {
    async list() {
      const f = await store.read()
      // Older sessions store a UTC timestamp, newer ones a local date: compare the day only.
      const day = (s: InterviewSession) => s.created.slice(0, 10)
      return [...f.sessions].reverse().map(shown).sort((a, b) => (day(a) < day(b) ? 1 : day(a) > day(b) ? -1 : 0))
    },
    async get(id) {
      return shown(await find(id))
    },
    async create(input) {
      const setup = cleanSetup(input)
      const session: InterviewSession = {
        id: newId(),
        created: today(),
        setup,
        turns: [],
        state: setup.web ? 'researching' : 'planning',
        practice: [],
      }
      await store.update((f) => {
        f.sessions.push(session)
      })
      background(session.id, (release) => (setup.web ? research(session.id, release) : plan(session.id, release)))
      return session
    },
    async keepResearch(id, kept) {
      if (!Array.isArray(kept) || kept.some((k) => !Number.isInteger(k))) throw new InterviewError('bad-state', 'kept must be a list of numbers.')
      // The state check and the job start happen inside one update, so two calls cannot both start a job.
      return store.update((f) => {
        const x = f.sessions.find((y) => y.id === id)
        if (!x) throw new InterviewError('not-found', 'Interview not found.')
        if (x.state !== 'review') throw new InterviewError('bad-state', 'This interview is not waiting for a research review.')
        x.research = (x.research ?? []).map((r: ResearchItem, i) => ({ ...r, kept: kept.includes(i) }))
        x.state = 'planning'
        delete x.error
        background(id, (release) => plan(id, release))
        return structuredClone(x)
      })
    },
    async answer(id, text, voice) {
      if (typeof text !== 'string' || !text.trim()) throw new InterviewError('bad-state', 'Write or record an answer first.')
      const answer = text.trim()
      if (answer.length > MAX_ANSWER) throw new InterviewError('bad-state', `The answer is too long (max ${MAX_ANSWER} characters).`)
      // Check, save the answer and start the job inside one update, so two calls cannot both get through.
      return store.update((f) => {
        const x = needRunning(f.sessions.find((y) => y.id === id))
        background(id, (release) => turn(id, release))
        x.turns.push({ round: x.current!.round, q: x.current!.q, from: 'candidate', text: answer, ...(voice ? { voice } : {}), at: today() })
        x.state = 'thinking'
        delete x.error
        return structuredClone(x)
      })
    },
    async skip(id) {
      return store.update((f) => {
        const x = needRunning(f.sessions.find((y) => y.id === id))
        // No Claude call: the job only holds the busy token while this update runs.
        background(id, async (release) => release())
        const cur = x.current!
        x.turns.push({ round: cur.round, q: cur.q, from: 'candidate', text: '', skipped: true, at: today() })
        const last = Number(cur.q.split('-')[1]) === x.plan![cur.round].questions.length - 1
        moveOn(x, '', last ? 'end_round' : 'next')
        return structuredClone(x)
      })
    },
    async retry(id) {
      return store.update((f) => {
        const x = f.sessions.find((y) => y.id === id)
        if (!x) throw new InterviewError('not-found', 'Interview not found.')
        if (running.has(id)) throw new InterviewError('busy', 'Still working.')
        const lastPractice = x.state === 'done' ? shown(x).practice.map((p) => Boolean(p.error)).lastIndexOf(true) : -1
        if (lastPractice >= 0) {
          background(id, (release) => grade(id, lastPractice, release))
          delete x.practice[lastPractice].error
          return structuredClone(x)
        }
        if (!shown(x).error) throw new InterviewError('bad-state', 'Nothing to retry.')
        if (x.state === 'review' && x.setup.web && (x.research ?? []).length === 0) x.state = 'researching'
        if (x.state === 'researching') background(id, (release) => research(id, release))
        else if (x.state === 'planning') background(id, (release) => plan(id, release))
        else if (x.state === 'thinking') background(id, (release) => turn(id, release))
        else if (x.state === 'reporting') background(id, (release) => report(id, release))
        else throw new InterviewError('bad-state', 'Nothing to retry.')
        delete x.error
        return structuredClone(x)
      })
    },
    async finish(id) {
      return store.update((f) => {
        const x = f.sessions.find((y) => y.id === id)
        if (!x) throw new InterviewError('not-found', 'Interview not found.')
        if (running.has(id)) throw new InterviewError('busy', 'Still working.')
        if (x.state !== 'running' || !x.plan) throw new InterviewError('bad-state', 'This interview cannot be finished now.')
        if (answeredPlan(x).length === 0) throw new InterviewError('bad-state', 'Answer at least one question first.')
        background(id, (release) => report(id, release))
        x.state = 'reporting'
        delete x.current
        delete x.error
        return structuredClone(x)
      })
    },
    async practice(id, q, text, voice) {
      if (typeof text !== 'string' || !text.trim()) throw new InterviewError('bad-state', 'Write or record an answer first.')
      const answer = text.trim()
      if (answer.length > MAX_ANSWER) throw new InterviewError('bad-state', `The answer is too long (max ${MAX_ANSWER} characters).`)
      // Save the answer and start the job inside one update, so the answer is never lost and two calls cannot both run.
      return store.update((f) => {
        const x = f.sessions.find((y) => y.id === id)
        if (!x) throw new InterviewError('not-found', 'Interview not found.')
        if (running.has(id)) throw new InterviewError('busy', 'Still working.')
        if (x.state !== 'done') throw new InterviewError('bad-state', 'Practice starts after the report.')
        if (!(x.plan ?? []).some((r) => r.questions.some((pq) => pq.q === q))) throw new InterviewError('bad-state', 'That question is not in this interview.')
        const index = x.practice.length
        background(id, (release) => grade(id, index, release))
        x.practice.push({ q, answer, ...(voice ? { voice } : {}), at: today() })
        return structuredClone(x)
      })
    },
    async weakSpots() {
      return summarizeWeakSpots((await store.read()).sessions)
    },
    async idle() {
      while (jobs.size) await Promise.all([...jobs])
    },
  }
}
