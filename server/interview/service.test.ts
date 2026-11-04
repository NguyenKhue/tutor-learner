import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import type { CatalogEntry, InterviewSetup } from '../../src/lib/types'
import { ClaudeError } from '../claude'
import { PLAN_SCHEMA, PRACTICE_SCHEMA, REPORT_SCHEMA, RESEARCH_SCHEMA, ROUND_SIZE, TURN_SCHEMA } from './prompts'
import * as history from './history'
import { InterviewError, createInterviewService } from './service'
import { createInterviewStore } from './store'

let dirs: string[] = []
afterEach(() => {
  dirs.forEach((d) => fs.rmSync(d, { recursive: true, force: true }))
  dirs = []
})

const setup = (over: Partial<InterviewSetup> = {}): InterviewSetup => ({
  source: 'Android engineer at Acme',
  level: 'senior',
  rounds: ['hr', 'technical'],
  topics: [],
  web: false,
  readAloud: false,
  ...over,
})

function rawPlan(kinds: string[], tag = 'Q') {
  return {
    rounds: kinds.map((kind, ri) => ({
      kind,
      persona: 'Ann, recruiter',
      intro: `Hello from ${kind}.`,
      competencies: ['a', 'b'],
      questions: Array.from({ length: ROUND_SIZE[kind as keyof typeof ROUND_SIZE] }, (_, qi) => ({
        prompt: `${tag} ${ri}-${qi}`,
        type: 'scenario',
        source: { url: 'https://example.com/x' },
        rubric: { mid: ['m'], senior: ['s'], lead: ['l'] },
        probes: ['p'],
      })),
    })),
  }
}

interface Fake {
  plans: Array<{ prompt: string }>
  researches: Array<{ prompt: string }>
  turns: Array<{ prompt: string }>
  reports: Array<{ prompt: string }>
  practices: Array<{ prompt: string }>
  reportResult: () => unknown
  practiceResult: () => unknown
  turnResult: () => unknown
  planResult: () => unknown
  researchResult: () => unknown
  claude: <T>(prompt: string, schema: object) => Promise<T>
  claudeWeb: <T>(prompt: string, schema: object) => Promise<T>
}

function fake(): Fake {
  const f: Fake = {
    plans: [],
    researches: [],
    turns: [],
    reports: [],
    practices: [],
    reportResult: () => ({
      levelMet: true,
      summary: 'Good.',
      questions: [
        { q: '0-0', scores: { reasoning: 2, depth: 3, structure: 3, english: 3, length: 3 }, missed: ['a'], sample: 's', englishNotes: [] },
        { q: '1-4', scores: { reasoning: 4, depth: 4, structure: 4, english: 4, length: 4 }, missed: [], sample: 's', englishNotes: [] },
      ],
      topFixes: [],
      nextSteps: { notes: [], topics: [], drills: [], gaps: [], focus: 'f' },
      weakSpots: [{ kind: 'content', key: 'no-numbers', label: 'No numbers' }],
    }),
    practiceResult: () => ({ q: '0-0', scores: { reasoning: 3, depth: 3, structure: 3, english: 3, length: 3 }, missed: [], sample: 'better', englishNotes: [] }),
    turnResult: () => ({ say: 'Thanks.', action: 'next' }),
    planResult: () => rawPlan(['hr', 'technical']),
    researchResult: () => ({ items: [{ kind: 'company', text: 'Acme builds apps', url: 'https://acme.com' }, { kind: 'process', text: 'no link', url: '' }] }),
    claude: async <T>(prompt: string, schema: object) => {
      if (schema === TURN_SCHEMA) {
        f.turns.push({ prompt })
        return f.turnResult() as T
      }
      if (schema === REPORT_SCHEMA) {
        f.reports.push({ prompt })
        return f.reportResult() as T
      }
      if (schema === PRACTICE_SCHEMA) {
        f.practices.push({ prompt })
        return f.practiceResult() as T
      }
      expect(schema).toBe(PLAN_SCHEMA)
      f.plans.push({ prompt })
      return f.planResult() as T
    },
    claudeWeb: async <T>(prompt: string, schema: object) => {
      expect(schema).toBe(RESEARCH_SCHEMA)
      f.researches.push({ prompt })
      return f.researchResult() as T
    },
  }
  return f
}

function make(f: Fake, file?: string) {
  const dir = file ? path.dirname(file) : fs.mkdtempSync(path.join(os.tmpdir(), 'interview-'))
  if (!file) dirs.push(dir)
  const store = createInterviewStore(file ?? path.join(dir, 'interviews.json'))
  let n = 0
  const catalog: Record<string, CatalogEntry> = {
    'A/n.md': { path: 'A/n.md', title: 'n', chars: 1, mtime: 0, hash: 'h', isSource: false, present: true, topic: 'Coroutines', priority: 'high' } as CatalogEntry,
  }
  const service = createInterviewService({
    vault: dir,
    store,
    readCatalog: async () => catalog,
    claude: (p, s) => f.claude(p, s),
    claudeWeb: (p, s) => f.claudeWeb(p, s),
    today: () => '2026-11-04',
    newId: () => `s${++n}`,
  })
  return { service, store, file: path.join(dir, 'interviews.json') }
}

test('create without web plans and opens with the first question of the first round', async () => {
  const f = fake()
  const { service, file } = make(f)
  fs.mkdirSync(path.join(path.dirname(file), 'A'))
  fs.writeFileSync(path.join(path.dirname(file), 'A/n.md'), 'Note body about coroutines')
  const created = await service.create(setup({ rounds: ['technical', 'hr'], topics: ['Coroutines'] }))
  expect(created.state).toBe('planning')
  expect(created.setup.rounds).toEqual(['hr', 'technical'])
  await service.idle()
  const s = await service.get(created.id)
  expect(s.state).toBe('running')
  expect(s.plan).toHaveLength(2)
  expect(s.current).toEqual({ round: 0, q: '0-0', followups: 0 })
  expect(s.turns).toHaveLength(1)
  expect(s.turns[0]).toMatchObject({ round: 0, q: '0-0', from: 'interviewer', text: 'Hello from hr.\n\nQ 0-0' })
  expect(f.researches).toHaveLength(0)
  expect(f.plans[0].prompt).toContain('PATH: A/n.md')
})

test('create rejects a bad setup', async () => {
  const { service } = make(fake())
  await expect(service.create(setup({ rounds: [] }))).rejects.toBeInstanceOf(InterviewError)
  await expect(service.create(setup({ rounds: ['nope' as never] }))).rejects.toMatchObject({ code: 'bad-state' })
  await expect(service.create(setup({ level: 'god' as never }))).rejects.toMatchObject({ code: 'bad-state' })
  await expect(service.get('missing')).rejects.toMatchObject({ code: 'not-found' })
})

test('create with web goes to review with the found items, and keepResearch plans with only the kept ones', async () => {
  const f = fake()
  f.researchResult = () => ({
    items: [
      { kind: 'company', text: 'Keep me fact', url: 'https://acme.com' },
      { kind: 'process', text: 'Drop me fact', url: 'https://acme.com/p' },
    ],
  })
  const { service } = make(f)
  const created = await service.create(setup({ web: true }))
  expect(created.state).toBe('researching')
  await service.idle()
  const review = await service.get(created.id)
  expect(review.state).toBe('review')
  expect(review.research).toHaveLength(2)
  expect(f.plans).toHaveLength(0)
  const planning = await service.keepResearch(created.id, [0])
  expect(planning.state).toBe('planning')
  await service.idle()
  const s = await service.get(created.id)
  expect(s.state).toBe('running')
  expect(s.research?.map((r) => r.kept)).toEqual([true, false])
  expect(f.plans[0].prompt).toContain('Keep me fact')
  expect(f.plans[0].prompt).not.toContain('Drop me fact')
})

test('failed or empty research still lets the interview start without web', async () => {
  const f = fake()
  f.researchResult = () => ({ items: [] })
  const { service } = make(f)
  const a = await service.create(setup({ web: true }))
  await service.idle()
  const empty = await service.get(a.id)
  expect(empty.state).toBe('review')
  expect(empty.research).toEqual([])
  expect(empty.error).toBeTruthy()

  f.claudeWeb = async () => {
    throw new ClaudeError('limit', 'Usage limit reached')
  }
  const b = await service.create(setup({ web: true }))
  await service.idle()
  const failed = await service.get(b.id)
  expect(failed.state).toBe('review')
  expect(failed.research).toEqual([])
  expect(failed.error).toEqual({ code: 'limit', message: 'Usage limit reached' })

  const started = await service.keepResearch(b.id, [])
  expect(started.state).toBe('planning')
  expect(started.error).toBeUndefined()
  await service.idle()
  expect((await service.get(b.id)).state).toBe('running')
})

test('an invalid plan is not saved and leaves an error to retry', async () => {
  const f = fake()
  f.planResult = () => rawPlan(['hr'])
  const { service } = make(f)
  const created = await service.create(setup())
  await service.idle()
  const s = await service.get(created.id)
  expect(s.state).toBe('planning')
  expect(s.plan).toBeUndefined()
  expect(s.turns).toEqual([])
  expect(s.error).toMatchObject({ code: 'failed' })
  expect(s.error?.message).toContain('rounds')
})

test('the plan avoids questions asked in earlier sessions', async () => {
  const f = fake()
  const { service, store } = make(f)
  const first = await service.create(setup())
  await service.idle()
  await store.update((file) => {
    file.sessions.find((x) => x.id === first.id)!.state = 'done'
  })
  await service.create(setup())
  await service.idle()
  expect(f.plans[1].prompt).toContain('Q 0-0')
  expect(f.plans[1].prompt).toContain('do not repeat')
  const list = await service.list()
  expect(list.map((x) => x.id)).toEqual(['s2', 's1'])
})

test('a session stuck in planning after a restart shows a retryable error', async () => {
  const f = fake()
  const { service, store, file } = make(f)
  await store.update((file) => {
    file.sessions.push({ id: 'old', created: '2026-11-03T00:00:00.000Z', setup: setup(), turns: [], state: 'planning', practice: [] })
  })
  const restarted = make(f, file).service
  const s = await restarted.get('old')
  expect(s.state).toBe('planning')
  expect(s.error).toEqual({ code: 'failed', message: 'Stopped before finishing. Try again.' })
  expect((await restarted.list())[0].error?.code).toBe('failed')
  // the file itself is not rewritten
  expect((await store.read()).sessions[0].error).toBeUndefined()
})

test('two keepResearch calls start only one plan', async () => {
  const f = fake()
  const { service } = make(f)
  const created = await service.create(setup({ web: true }))
  await service.idle()
  const results = await Promise.allSettled([service.keepResearch(created.id, [0]), service.keepResearch(created.id, [0])])
  expect(results.map((r) => r.status).sort()).toEqual(['fulfilled', 'rejected'])
  await service.idle()
  const s = await service.get(created.id)
  expect(f.plans).toHaveLength(1)
  expect(s.turns).toHaveLength(1)
  expect(s.error).toBeUndefined()
})

test('keepResearch right after research finishes is never busy', async () => {
  const f = fake()
  const { service } = make(f)
  const created = await service.create(setup({ web: true }))
  for (;;) {
    const s = await service.get(created.id)
    if (s.state === 'review') break
    await new Promise((r) => setTimeout(r, 0))
  }
  await expect(service.keepResearch(created.id, [0])).resolves.toMatchObject({ state: 'planning' })
  await service.idle()
})

test('keepResearch checks its input and the session', async () => {
  const { service } = make(fake())
  await expect(service.keepResearch('nope', [0])).rejects.toMatchObject({ code: 'not-found' })
  await expect(service.keepResearch('nope', 'x' as never)).rejects.toMatchObject({ code: 'bad-state' })
  await expect(service.keepResearch('nope', [1.5])).rejects.toMatchObject({ code: 'bad-state' })
})

test('create checks the other setup fields and stores only known ones', async () => {
  const f = fake()
  const { service } = make(f)
  await expect(service.create(setup({ topics: [1] as never }))).rejects.toMatchObject({ code: 'bad-state' })
  await expect(service.create(setup({ source: 5 as never }))).rejects.toMatchObject({ code: 'bad-state' })
  await expect(service.create(setup({ web: 'yes' as never }))).rejects.toMatchObject({ code: 'bad-state' })
  await expect(service.create(setup({ readAloud: undefined as never }))).rejects.toMatchObject({ code: 'bad-state' })
  const s = await service.create({ ...setup(), extra: 'x' } as never)
  expect(Object.keys(s.setup).sort()).toEqual(['level', 'readAloud', 'rounds', 'source', 'topics', 'web'])
  await service.idle()
})

test('planning puts the re-ask queue into the plan prompt', async () => {
  const spy = vi.spyOn(history, 'reaskQueue').mockReturnValue([{ round: 'hr', prompt: 'Tell me about salary again' }])
  try {
    const f = fake()
    const { service } = make(f)
    await service.create(setup())
    await service.idle()
    expect(spy).toHaveBeenCalledWith(expect.any(Array), '2026-11-04', ['hr', 'technical'])
    expect(f.plans[0].prompt).toContain('Tell me about salary again')
  } finally {
    spy.mockRestore()
  }
})

test('avoid ignores sessions that are not done', async () => {
  const f = fake()
  const { service } = make(f)
  await service.create(setup())
  await service.idle()
  await service.create(setup())
  await service.idle()
  expect(f.plans[1].prompt).not.toContain('Q 0-0')
})

async function started(f: Fake, over: Partial<InterviewSetup> = {}) {
  const m = make(f)
  const created = await m.service.create(setup(over))
  await m.service.idle()
  return { ...m, id: created.id }
}

test('an answer is saved before Claude runs and kept when Claude fails', async () => {
  const f = fake()
  const { service, id } = await started(f)
  let seen: Awaited<ReturnType<typeof service.get>> | undefined
  f.turnResult = () => {
    throw new ClaudeError('limit', 'Usage limit reached')
  }
  const claudeThrows = f.claude
  f.claude = async (p, s) => {
    seen = await service.get(id)
    return claudeThrows(p, s)
  }
  const thinking = await service.answer(id, '  My answer  ', { audio: 'a', seconds: 3 })
  expect(thinking.state).toBe('thinking')
  await service.idle()
  expect(seen?.turns.at(-1)).toMatchObject({ from: 'candidate', text: 'My answer', voice: { audio: 'a', seconds: 3 } })
  const failed = await service.get(id)
  expect(failed.state).toBe('thinking')
  expect(failed.error).toEqual({ code: 'limit', message: 'Usage limit reached' })
  expect(failed.turns).toHaveLength(2)

  f.claude = claudeThrows
  f.turnResult = () => ({ say: 'Good.', action: 'next' })
  const retried = await service.retry(id)
  expect(retried.error).toBeUndefined()
  await service.idle()
  const s = await service.get(id)
  expect(s.state).toBe('running')
  expect(s.error).toBeUndefined()
  expect(s.turns).toHaveLength(3)
  expect(s.turns.filter((t) => t.from === 'candidate')).toHaveLength(1)
  expect(s.turns[2]).toMatchObject({ from: 'interviewer', q: '0-1', text: 'Good.\n\nQ 0-1' })
  expect(s.current).toEqual({ round: 0, q: '0-1', followups: 0 })
  expect(f.turns).toHaveLength(2)
})

test('follow-ups stop after two and the interview moves on', async () => {
  const f = fake()
  f.turnResult = () => ({ say: 'Tell me more?', action: 'followup' })
  const { service, id } = await started(f)
  await service.answer(id, 'one')
  await service.idle()
  let s = await service.get(id)
  expect(s.current).toEqual({ round: 0, q: '0-0', followups: 1 })
  expect(s.turns.at(-1)).toMatchObject({ from: 'interviewer', q: '0-0', text: 'Tell me more?' })
  await service.answer(id, 'two')
  await service.idle()
  expect((await service.get(id)).current?.followups).toBe(2)
  await service.answer(id, 'three')
  await service.idle()
  s = await service.get(id)
  expect(s.current).toEqual({ round: 0, q: '0-1', followups: 0 })
  expect(s.turns.at(-1)).toMatchObject({ from: 'interviewer', q: '0-1', text: 'Q 0-1' })
})

test('the last question of a round opens the next round with its intro', async () => {
  const f = fake()
  const { service, id } = await started(f)
  for (let i = 0; i < ROUND_SIZE.hr - 1; i++) {
    await service.answer(id, `a${i}`)
    await service.idle()
  }
  expect((await service.get(id)).current?.q).toBe('0-4')
  f.turnResult = () => ({ say: 'That is all for this round.', action: 'next' })
  await service.answer(id, 'last')
  await service.idle()
  const s = await service.get(id)
  expect(s.current).toEqual({ round: 1, q: '1-0', followups: 0 })
  expect(s.turns.at(-1)).toMatchObject({ round: 1, q: '1-0', from: 'interviewer', text: 'That is all for this round.\n\nHello from technical.\n\nQ 1-0' })
})

test('the last answer of the last round leaves the session ready to finish', async () => {
  const f = fake()
  const { service, id, store } = await started(f)
  await store.update((file) => {
    const s = file.sessions[0]
    s.current = { round: 1, q: '1-4', followups: 0 }
  })
  f.turnResult = () => ({ say: 'Thank you, that is the end.', action: 'end_round' })
  await service.answer(id, 'final')
  await service.idle()
  const s = await service.get(id)
  expect(s.state).toBe('running')
  expect(s.current).toBeUndefined()
  expect(s.error).toBeUndefined()
  expect(s.turns.at(-1)).toMatchObject({ from: 'interviewer', text: 'Thank you, that is the end.' })
})

test('a second answer while one is being handled is refused as busy', async () => {
  const f = fake()
  const { service, id } = await started(f)
  let open!: () => void
  const gate = new Promise<void>((r) => (open = r))
  const orig = f.claude
  f.claude = async (p, s) => {
    await gate
    return orig(p, s)
  }
  await service.answer(id, 'first')
  await expect(service.answer(id, 'second')).rejects.toMatchObject({ code: 'busy' })
  await expect(service.skip(id)).rejects.toMatchObject({ code: 'busy' })
  open()
  await service.idle()
  const s = await service.get(id)
  expect(s.turns.filter((t) => t.from === 'candidate')).toHaveLength(1)
})

test('skip moves on without calling Claude', async () => {
  const f = fake()
  const { service, id } = await started(f)
  const s = await service.skip(id)
  expect(f.turns).toHaveLength(0)
  expect(s.state).toBe('running')
  expect(s.current).toEqual({ round: 0, q: '0-1', followups: 0 })
  expect(s.turns.slice(1)).toMatchObject([
    { from: 'candidate', q: '0-0', text: '', skipped: true },
    { from: 'interviewer', q: '0-1', text: 'Q 0-1' },
  ])
  await service.idle()
})

test('skip on the last question of a round opens the next round', async () => {
  const f = fake()
  const { service, id, store } = await started(f)
  await store.update((file) => {
    file.sessions[0].current = { round: 0, q: '0-4', followups: 1 }
  })
  const s = await service.skip(id)
  expect(s.current).toEqual({ round: 1, q: '1-0', followups: 0 })
  expect(s.turns.at(-1)).toMatchObject({ text: 'Hello from technical.\n\nQ 1-0' })
})

test('an empty or over-long answer is refused', async () => {
  const f = fake()
  const { service, id } = await started(f)
  await expect(service.answer(id, '   ')).rejects.toMatchObject({ code: 'bad-state' })
  await expect(service.answer(id, 'x'.repeat(8001))).rejects.toMatchObject({ code: 'bad-state' })
  await expect(service.answer(id, 5 as never)).rejects.toMatchObject({ code: 'bad-state' })
  await expect(service.answer('nope', 'hi')).rejects.toMatchObject({ code: 'not-found' })
  expect(f.turns).toHaveLength(0)
  expect((await service.get(id)).turns).toHaveLength(1)
  await service.answer(id, 'x'.repeat(8000))
  await service.idle()
})

test('answer and skip need a running interview', async () => {
  const f = fake()
  f.planResult = () => rawPlan(['hr'])
  const { service, id } = await started(f)
  await expect(service.answer(id, 'hi')).rejects.toMatchObject({ code: 'bad-state' })
  await expect(service.skip(id)).rejects.toMatchObject({ code: 'bad-state' })
})

test('retry reruns a failed plan and a failed research', async () => {
  const f = fake()
  f.planResult = () => rawPlan(['hr'])
  const { service, id } = await started(f)
  expect((await service.get(id)).error).toBeTruthy()
  f.planResult = () => rawPlan(['hr', 'technical'])
  expect((await service.retry(id)).error).toBeUndefined()
  await service.idle()
  expect((await service.get(id)).state).toBe('running')

  const g = fake()
  g.researchResult = () => ({ items: [] })
  const r = await started(g, { web: true })
  expect((await r.service.get(r.id)).error).toBeTruthy()
  g.researchResult = () => ({ items: [{ kind: 'company', text: 'Fact', url: 'https://acme.com' }] })
  const again = await r.service.retry(r.id)
  expect(again.state).toBe('researching')
  await r.service.idle()
  const s = await r.service.get(r.id)
  expect(s.state).toBe('review')
  expect(s.error).toBeUndefined()
  expect(s.research).toHaveLength(1)
})

test('retry refuses a healthy session and a running job', async () => {
  const f = fake()
  const { service, id } = await started(f)
  await expect(service.retry(id)).rejects.toMatchObject({ code: 'bad-state' })
  await expect(service.retry('nope')).rejects.toMatchObject({ code: 'not-found' })
})

/** A running session where 0-0 was answered, 0-1 skipped, and nothing else asked. */
async function answeredOne(f: Fake) {
  const m = await started(f)
  await m.service.answer(m.id, 'my first answer')
  await m.service.idle()
  await m.service.skip(m.id)
  await m.service.idle()
  return m
}

test('finish reports on answered questions and passes known weak keys', async () => {
  const f = fake()
  const { service, store, id } = await answeredOne(f)
  await store.update((file) => {
    file.sessions.unshift({
      id: 'old', created: '2026-10-01', setup: setup(), turns: [], state: 'done', practice: [],
      report: { levelMet: false, summary: '', questions: [], topFixes: [], nextSteps: { notes: [], topics: [], drills: [], gaps: [], focus: '' }, weakSpots: [{ kind: 'english', key: 'old-key', label: 'Old' }] },
    })
  })
  const r = await service.finish(id)
  expect(r.state).toBe('reporting')
  await service.idle()
  const s = await service.get(id)
  expect(s.state).toBe('done')
  expect(s.error).toBeUndefined()
  // only the answered question is kept
  expect(s.report?.questions.map((q) => q.q)).toEqual(['0-0'])
  expect(s.report?.weakSpots).toEqual([{ kind: 'content', key: 'no-numbers', label: 'No numbers' }])
  expect(f.reports[0].prompt).toContain('old-key')
  expect(f.reports[0].prompt).toContain('### 0-0:')
  expect(f.reports[0].prompt).not.toContain('### 0-1:')
})

test('ending early reports what was answered', async () => {
  const f = fake()
  const { service, id } = await started(f)
  await service.answer(id, 'only answer')
  await service.idle()
  expect((await service.get(id)).current).toBeDefined()
  await service.finish(id)
  await service.idle()
  const s = await service.get(id)
  expect(s.state).toBe('done')
  expect(s.report?.questions.map((q) => q.q)).toEqual(['0-0'])
  expect(f.reports[0].prompt).not.toContain('### 1-0:')
})

test('finish is busy while running, refused with no answers, and retry reruns a failed report', async () => {
  const f = fake()
  const { service, id } = await started(f)
  await expect(service.finish(id)).rejects.toMatchObject({ code: 'bad-state' })
  await service.answer(id, 'a')
  await service.idle()
  f.reportResult = () => {
    throw new ClaudeError('limit', 'Usage limit reached')
  }
  let open!: () => void
  const gate = new Promise<void>((r) => (open = r))
  const orig = f.claude
  f.claude = async (p, s) => {
    await gate
    return orig(p, s)
  }
  await service.finish(id)
  await expect(service.finish(id)).rejects.toMatchObject({ code: 'busy' })
  open()
  await service.idle()
  const failed = await service.get(id)
  expect(failed.state).toBe('reporting')
  expect(failed.error).toEqual({ code: 'limit', message: 'Usage limit reached' })
  f.claude = orig
  f.reportResult = fake().reportResult
  await service.retry(id)
  await service.idle()
  const ok = await service.get(id)
  expect(ok.state).toBe('done')
  expect(ok.error).toBeUndefined()
})

async function done(f: Fake) {
  const m = await started(f)
  await m.service.answer(m.id, 'a')
  await m.service.idle()
  await m.service.finish(m.id)
  await m.service.idle()
  return m
}

test('practice saves the answer first and keeps it when grading fails', async () => {
  const f = fake()
  const { service, id } = await done(f)
  await expect(service.practice(id, '9-9', 'x')).rejects.toMatchObject({ code: 'bad-state' })
  await expect(service.practice(id, '0-0', '  ')).rejects.toMatchObject({ code: 'bad-state' })
  f.practiceResult = () => {
    throw new ClaudeError('failed', 'boom')
  }
  let seen: Awaited<ReturnType<typeof service.get>> | undefined
  const orig = f.claude
  f.claude = async (p, s) => {
    if (s === PRACTICE_SCHEMA) seen = await service.get(id)
    return orig(p, s)
  }
  const saved = await service.practice(id, '0-0', ' my retry ', { audio: 'a', seconds: 2 })
  expect(saved.practice).toHaveLength(1)
  expect(saved.practice[0]).toMatchObject({ q: '0-0', answer: 'my retry', voice: { audio: 'a', seconds: 2 } })
  await service.idle()
  expect(seen?.practice[0].answer).toBe('my retry')
  const failed = await service.get(id)
  expect(failed.practice).toHaveLength(1)
  expect(failed.practice[0].error).toEqual({ code: 'failed', message: 'boom' })
  expect(failed.practice[0].result).toBeUndefined()

  f.claude = orig
  f.practiceResult = fake().practiceResult
  await service.retry(id)
  await service.idle()
  const ok = await service.get(id)
  expect(ok.practice).toHaveLength(1)
  expect(ok.practice[0].error).toBeUndefined()
  expect(ok.practice[0].result).toMatchObject({ q: '0-0', sample: 'better' })
  expect(f.practices).toHaveLength(2)
})

test('practice needs a done session', async () => {
  const f = fake()
  const { service, id } = await started(f)
  await expect(service.practice(id, '0-0', 'x')).rejects.toMatchObject({ code: 'bad-state' })
})

function seedDone(file: { sessions: any[] }, created: string, q: string, reasoning: number, reask?: string) {
  const s = file.sessions[file.sessions.length - 1]
  s.created = created
  s.state = 'done'
  delete s.current
  if (reask) s.plan[1].questions[Number(q.split('-')[1])].reask = reask
  s.report = {
    levelMet: false, summary: '', topFixes: [], weakSpots: [], nextSteps: { notes: [], topics: [], drills: [], gaps: [], focus: '' },
    questions: [{ q, scores: { reasoning, depth: 3, structure: 3, english: 3, length: 3 }, missed: [], sample: '', englishNotes: [] }],
  }
}

test('planning puts due re-asks into the plan and marks only the exact reask', async () => {
  const f = fake()
  const { service, store } = make(f)
  await service.create(setup())
  await service.idle()
  await store.update((file) => seedDone(file, '2026-10-01', '1-2', 1))
  f.planResult = () => {
    const p = rawPlan(['hr', 'technical'], 'N')
    const qs = p.rounds[1].questions
    qs[0].prompt = 'Reworded version'
    ;(qs[0] as Record<string, unknown>).reask = 'Q 1-2'
    qs[1].prompt = 'Q 1-2 is similar'
    ;(qs[2] as Record<string, unknown>).reask = 'something not queued'
    return p
  }
  const second = await service.create(setup())
  await service.idle()
  expect(f.plans[1].prompt).toContain('[technical] Q 1-2')
  const s = await service.get(second.id)
  const marked = s.plan![1].questions.filter((q) => q.reask)
  expect(marked).toHaveLength(1)
  expect(marked[0]).toMatchObject({ prompt: 'Reworded version', reask: 'Q 1-2' })
})

test('a weak question is re-asked, marked, and leaves the queue after a good re-answer', async () => {
  const f = fake()
  const { service, store } = make(f)
  await service.create(setup())
  await service.idle()
  await store.update((file) => seedDone(file, '2026-10-01', '1-2', 1))
  f.planResult = () => {
    const p = rawPlan(['hr', 'technical'], 'N')
    ;(p.rounds[1].questions[0] as Record<string, unknown>).reask = 'Q 1-2'
    p.rounds[1].questions[0].prompt = 'Reworded version'
    return p
  }
  const second = await service.create(setup())
  await service.idle()
  expect((await service.get(second.id)).plan![1].questions[0].reask).toBe('Q 1-2')
  await store.update((file) => seedDone(file, '2026-10-10', '1-0', 4))
  const third = await service.create(setup())
  await service.idle()
  expect(f.plans[2].prompt).not.toContain('Questions Khue wants to be asked again')
  expect(third.id).toBe('s3')
})

test('finish works after the last answer cleared current', async () => {
  const f = fake()
  const { service, id, store } = await started(f)
  await store.update((file) => {
    file.sessions[0].current = { round: 1, q: '1-4', followups: 0 }
  })
  f.turnResult = () => ({ say: 'That is the end.', action: 'end_round' })
  await service.answer(id, 'final')
  await service.idle()
  expect((await service.get(id)).current).toBeUndefined()
  await service.finish(id)
  await service.idle()
  expect((await service.get(id)).state).toBe('done')
})

test('a second practice while grading is busy', async () => {
  const f = fake()
  const { service, id } = await done(f)
  let open!: () => void
  const gate = new Promise<void>((r) => (open = r))
  const orig = f.claude
  f.claude = async (p, s) => {
    await gate
    return orig(p, s)
  }
  await service.practice(id, '0-0', 'one')
  await expect(service.practice(id, '0-0', 'two')).rejects.toMatchObject({ code: 'busy' })
  open()
  await service.idle()
  expect((await service.get(id)).practice).toHaveLength(1)
})

test('weakSpots summarizes stored sessions', async () => {
  const { service } = make(fake())
  expect(await service.weakSpots()).toEqual([])
})
