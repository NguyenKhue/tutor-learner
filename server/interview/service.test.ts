import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import type { CatalogEntry, InterviewSetup } from '../../src/lib/types'
import { ClaudeError } from '../claude'
import { PLAN_SCHEMA, RESEARCH_SCHEMA, ROUND_SIZE } from './prompts'
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
  planResult: () => unknown
  researchResult: () => unknown
  claude: <T>(prompt: string, schema: object) => Promise<T>
  claudeWeb: <T>(prompt: string, schema: object) => Promise<T>
}

function fake(): Fake {
  const f: Fake = {
    plans: [],
    researches: [],
    planResult: () => rawPlan(['hr', 'technical']),
    researchResult: () => ({ items: [{ kind: 'company', text: 'Acme builds apps', url: 'https://acme.com' }, { kind: 'process', text: 'no link', url: '' }] }),
    claude: async <T>(prompt: string, schema: object) => {
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
