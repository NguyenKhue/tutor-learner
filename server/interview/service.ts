import type { CatalogEntry, InterviewSession, InterviewSetup, ResearchItem, RoundKind, Voice } from '../../src/lib/types'
import { ClaudeError } from '../claude'
import { buildVaultContext } from './context'
import { reaskQueue, type WeakSpotSummary } from './history'
import { PLAN_SCHEMA, RESEARCH_SCHEMA, buildPlanPrompt, buildResearchPrompt, validatePlan, validateResearch } from './prompts'
import type { createInterviewStore } from './store'

const ROUND_ORDER: RoundKind[] = ['hr', 'technical', 'system_design', 'behavioral']
const LEVELS = ['mid', 'senior', 'lead']
const AVOID_LIMIT = 60
const WORKING = ['researching', 'planning', 'thinking', 'reporting']

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
  const { vault, store, readCatalog, claude, claudeWeb, today } = deps
  const newId = deps.newId ?? (() => crypto.randomUUID())
  const running = new Set<string>()
  const jobs = new Set<Promise<void>>()

  function background(id: string, work: () => Promise<void>) {
    running.add(id)
    const job = work()
      .catch(() => undefined)
      .finally(() => {
        running.delete(id)
        jobs.delete(job)
      })
    jobs.add(job)
  }

  /** A session that claims to be working but has no job (after a restart) is shown as a retryable error. */
  function shown(s: InterviewSession): InterviewSession {
    if (WORKING.includes(s.state) && !running.has(s.id) && !s.error) {
      return { ...s, error: { code: 'failed', message: 'Stopped before finishing. Try again.' } }
    }
    return s
  }

  async function patch(id: string, fn: (s: InterviewSession) => void) {
    await store.update((f) => {
      const s = f.sessions.find((x) => x.id === id)
      if (s) fn(s)
    })
  }

  async function plan(id: string) {
    try {
      const file = await store.read()
      const s = file.sessions.find((x) => x.id === id)
      if (!s) return
      const catalog = await readCatalog()
      const avoid = file.sessions
        .filter((x) => x.state === 'done')
        .flatMap((x) => (x.plan ?? []).flatMap((r) => r.questions.map((q) => q.prompt)))
        .slice(-AVOID_LIMIT)
      const prompt = buildPlanPrompt({
        setup: s.setup,
        notes: buildVaultContext(vault, catalog, s.setup.topics),
        research: s.research ?? [],
        avoid,
        reask: reaskQueue(file.sessions, today(), s.setup.rounds),
      })
      const raw = await claude<unknown>(prompt, PLAN_SCHEMA)
      const rounds = validatePlan(raw, s.setup)
      await patch(id, (x) => {
        x.plan = rounds
        x.state = 'running'
        x.current = { round: 0, q: '0-0', followups: 0 }
        x.turns.push({ round: 0, q: '0-0', from: 'interviewer', text: `${rounds[0].intro}\n\n${rounds[0].questions[0].prompt}`, at: today() })
        delete x.error
      })
    } catch (e) {
      await patch(id, (x) => {
        x.error = errorOf(e)
      })
    }
  }

  async function research(id: string) {
    try {
      const file = await store.read()
      const s = file.sessions.find((x) => x.id === id)
      if (!s) return
      const catalog = await readCatalog()
      const vaultTopics = [...new Set(Object.values(catalog).map((e) => e.topic).filter((t): t is string => Boolean(t)))]
      const raw = await claudeWeb<unknown>(buildResearchPrompt({ setup: s.setup, vaultTopics }), RESEARCH_SCHEMA)
      const items = validateResearch(raw)
      await patch(id, (x) => {
        x.research = items
        x.state = 'review'
        if (items.length === 0) x.error = { code: 'failed', message: 'No research found. You can start the interview without it.' }
        else delete x.error
      })
    } catch (e) {
      await patch(id, (x) => {
        x.research = []
        x.state = 'review'
        x.error = errorOf(e)
      })
    }
  }

  function cleanSetup(setup: InterviewSetup): InterviewSetup {
    if (!Array.isArray(setup.rounds) || setup.rounds.length === 0) throw new InterviewError('bad-state', 'Choose at least one round.')
    if (setup.rounds.some((r) => !ROUND_ORDER.includes(r))) throw new InterviewError('bad-state', 'Unknown round.')
    if (!LEVELS.includes(setup.level)) throw new InterviewError('bad-state', 'Unknown level.')
    return { ...setup, rounds: ROUND_ORDER.filter((r) => setup.rounds.includes(r)) }
  }

  async function find(id: string): Promise<InterviewSession> {
    const s = (await store.read()).sessions.find((x) => x.id === id)
    if (!s) throw new InterviewError('not-found', 'Interview not found.')
    return s
  }

  const todo = (): never => {
    throw new InterviewError('bad-state', 'not implemented')
  }

  return {
    async list() {
      const f = await store.read()
      return [...f.sessions].reverse().map(shown).sort((a, b) => (a.created < b.created ? 1 : a.created > b.created ? -1 : 0))
    },
    async get(id) {
      return shown(await find(id))
    },
    async create(input) {
      const setup = cleanSetup(input)
      const session: InterviewSession = {
        id: newId(),
        created: new Date().toISOString(),
        setup,
        turns: [],
        state: setup.web ? 'researching' : 'planning',
        practice: [],
      }
      await store.update((f) => {
        f.sessions.push(session)
      })
      background(session.id, () => (setup.web ? research(session.id) : plan(session.id)))
      return session
    },
    async keepResearch(id, kept) {
      const s = await find(id)
      if (s.state !== 'review') throw new InterviewError('bad-state', 'This interview is not waiting for a research review.')
      if (running.has(id)) throw new InterviewError('busy', 'Still working.')
      const saved = await store.update((f) => {
        const x = f.sessions.find((y) => y.id === id)!
        x.research = (x.research ?? []).map((r: ResearchItem, i) => ({ ...r, kept: kept.includes(i) }))
        x.state = 'planning'
        delete x.error
        return x
      })
      background(id, () => plan(id))
      return saved
    },
    answer: async () => todo(),
    skip: async () => todo(),
    retry: async () => todo(),
    finish: async () => todo(),
    practice: async () => todo(),
    weakSpots: async () => todo(),
    async idle() {
      while (jobs.size) await Promise.all([...jobs])
    },
  }
}
