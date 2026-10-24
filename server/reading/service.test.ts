import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { ClaudeError } from '../claude'
import { createStateStore } from '../state'
import { StudyError } from '../study'
import { makeTestVault } from '../testVault'
import { createTutorCli } from '../tutor'
import { CLASSIFY_SCHEMA, READING_GRADE_SCHEMA, READING_QUIZ_SCHEMA } from './prompts'
import { createReadingService } from './service'

let today = '2026-10-24'
let cleanups: Array<() => void> = []
afterEach(() => {
  cleanups.forEach((c) => c())
  cleanups = []
  today = '2026-10-24'
})

interface Fake {
  calls: Array<{ schema: object; prompt: string }>
  fail?: ClaudeError
  failOn?: (schema: object, n: number) => ClaudeError | undefined
  grades: boolean[][]
  fn: <T>(prompt: string, schema: object) => Promise<T>
}

function fake(): Fake {
  const f: Fake = {
    calls: [],
    grades: [],
    fn: async <T>(prompt: string, schema: object): Promise<T> => {
      f.calls.push({ schema, prompt })
      const injected = f.failOn?.(schema, f.calls.filter((c) => c.schema === schema).length)
      if (f.fail ?? injected) throw f.fail ?? injected
      if (schema === CLASSIFY_SCHEMA) {
        const paths = [...prompt.matchAll(/^PATH: (.+)$/gm)].map((m) => m[1])
        return { notes: paths.map((p) => ({ path: p, topic: p.includes('Garden') ? 'Gardening' : 'Kotlin', priority: 'high', minutes: 4, why: 'useful' })) } as T
      }
      if (schema === READING_QUIZ_SCHEMA) {
        return { questions: ['a', 'b', 'c'].map((x) => ({ q: x, kind: 'open', prompt: `Q ${x}`, criteria: ['c1', 'c2'] })) } as T
      }
      if (schema === READING_GRADE_SCHEMA) {
        const oks = f.grades.shift() ?? [true, true, true]
        return { results: oks.map((ok, i) => ({ q: `r${i + 1}`, ok, why: ok ? 'good' : 'bad', missing: ok ? [] : ['c2'], feedback: 'fb' })), english: null } as T
      }
      throw new Error('unexpected schema')
    },
  }
  return f
}

function setup(extraFiles: Record<string, string> = {}) {
  const files: Record<string, string> = { 'Notes/Source.md': '# Source\nsource text', 'Notes/Extra.md': '# Extra\nextra text', ...extraFiles }
  const v = makeTestVault([{ topic: 'Kotlin', name: '01 Null', type: 'concept', order: 1, sources: ['[[Notes/Source]]'] }], { files })
  cleanups.push(v.cleanup)
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'reading-data-'))
  cleanups.push(() => fs.rmSync(dataDir, { recursive: true, force: true }))
  const stateFile = path.join(dataDir, 'state.json')
  const claude = fake()
  let n = 0
  const make = () =>
    createReadingService({ vault: v.vault, tutor: createTutorCli({ vault: v.vault }), store: createStateStore(stateFile), claude: claude.fn, today: () => today, newId: () => `c${++n}` })
  return { vault: v.vault, claude, stateFile, make, service: make() }
}

const answers = { r1: 'one', r2: 'two', r3: 'three' }

test('sync builds the catalog and marks point sources', async () => {
  const s = setup()
  const o = await s.service.overview()
  const byPath = Object.fromEntries(o.items.map((i) => [i.path, i]))
  expect(Object.keys(byPath).sort()).toEqual(['Notes/Extra.md', 'Notes/Source.md'])
  expect(byPath['Notes/Source.md'].isSource).toBe(true)
  expect(byPath['Notes/Extra.md'].isSource).toBe(false)
  expect(o.classify).toEqual({ total: 2, done: 0, running: false, error: null })
})

test('classify runs in batches of 10 and saves topics', async () => {
  const files: Record<string, string> = {}
  for (let i = 0; i < 23; i++) files[`Many/N${String(i).padStart(2, '0')}.md`] = `note ${i}`
  const s = setup(files)
  await s.service.classifyPending()
  expect(s.claude.calls.filter((c) => c.schema === CLASSIFY_SCHEMA)).toHaveLength(3)
  const o = await s.service.overview()
  expect(o.classify).toMatchObject({ total: 25, done: 25 })
  expect(o.items.every((i) => i.topic === 'Kotlin' && i.priority === 'high' && i.minutes === 4)).toBe(true)
  expect(s.claude.calls[0].prompt).toContain('Kotlin')
})

test('invalid topic becomes null', async () => {
  const s = setup({ 'Home/Garden.md': 'tomatoes' })
  await s.service.classifyPending()
  const o = await s.service.overview()
  expect(o.items.find((i) => i.path === 'Home/Garden.md')!.topic).toBeNull()
})

test('classify stops on limit and resumes', async () => {
  const files: Record<string, string> = {}
  for (let i = 0; i < 18; i++) files[`Many/N${String(i).padStart(2, '0')}.md`] = `note ${i}`
  const s = setup(files)
  s.claude.failOn = (schema, n) => (schema === CLASSIFY_SCHEMA && n === 2 ? new ClaudeError('limit', 'usage limit') : undefined)
  await s.service.classifyPending()
  let o = await s.service.overview()
  expect(o.classify).toMatchObject({ total: 20, done: 10, running: false, error: 'usage limit' })
  s.claude.failOn = undefined
  await s.service.classifyPending()
  o = await s.service.overview()
  expect(o.classify).toMatchObject({ done: 20, error: null })
})

test('reclassify one note runs one call for it', async () => {
  const s = setup()
  await s.service.classifyPending()
  const before = s.claude.calls.length
  await s.service.reclassify('Notes/Extra.md')
  expect(s.claude.calls.length).toBe(before + 1)
  expect(s.claude.calls.at(-1)!.prompt).toContain('PATH: Notes/Extra.md')
  expect(s.claude.calls.at(-1)!.prompt).not.toContain('PATH: Notes/Source.md')
})

test('quiz is made once and reused', async () => {
  const s = setup()
  const a = await s.service.quiz('Notes/Extra.md')
  const b = await s.service.quiz('Notes/Extra.md')
  expect(a.questions.map((q) => q.q)).toEqual(['r1', 'r2', 'r3'])
  expect(b).toEqual(a)
  expect(s.claude.calls.filter((c) => c.schema === READING_QUIZ_SCHEMA)).toHaveLength(1)
  expect(s.claude.calls[0].prompt).toContain('extra text')
})

test('two of three correct passes', async () => {
  const s = setup()
  await s.service.quiz('Notes/Extra.md')
  s.claude.grades.push([true, false, true])
  const c = await s.service.submit('Notes/Extra.md', answers)
  expect(c).toMatchObject({ state: 'graded', passed: true, kind: 'first' })
  expect(s.claude.calls.filter((x) => x.schema === READING_GRADE_SCHEMA)).toHaveLength(1)
  const item = (await s.service.overview()).items.find((i) => i.path === 'Notes/Extra.md')!
  expect(item).toMatchObject({ status: 'understood', rung: 1, nextCheck: '2026-10-31' })
})

test('one of three correct fails and asks for a reread', async () => {
  const s = setup()
  await s.service.quiz('Notes/Extra.md')
  s.claude.grades.push([true, false, false])
  const c = await s.service.submit('Notes/Extra.md', answers)
  expect(c.passed).toBe(false)
  const item = (await s.service.overview()).items.find((i) => i.path === 'Notes/Extra.md')!
  expect(item).toMatchObject({ status: 'reread', nextCheck: '2026-10-26' })
})

test('regenerates the quiz when the note changed and keeps the rung', async () => {
  const s = setup()
  await s.service.quiz('Notes/Extra.md')
  await s.service.submit('Notes/Extra.md', answers)
  fs.writeFileSync(path.join(s.vault, 'Notes/Extra.md'), '# Extra\nchanged text')
  today = '2026-10-31'
  const q = await s.service.quiz('Notes/Extra.md')
  expect(s.claude.calls.filter((c) => c.schema === READING_QUIZ_SCHEMA)).toHaveLength(2)
  expect(s.claude.calls.at(-1)!.prompt).toContain('changed text')
  const c = await s.service.submit('Notes/Extra.md', answers)
  expect(c.kind).toBe('recheck')
  expect(c.quizHash).toBe(q.hash)
  const item = (await s.service.overview()).items.find((i) => i.path === 'Notes/Extra.md')!
  expect(item).toMatchObject({ rung: 2, nextCheck: '2026-11-21' })
})

test('submit needs an answer for every question', async () => {
  const s = setup()
  await s.service.quiz('Notes/Extra.md')
  const err = await s.service.submit('Notes/Extra.md', { r1: 'x', r2: ' ' }).catch((e) => e)
  expect(err).toBeInstanceOf(StudyError)
  expect(err.code).toBe('bad-state')
})

test('submit saves the answers before grading and a limit keeps the check pending', async () => {
  const s = setup()
  await s.service.quiz('Notes/Extra.md')
  s.claude.fail = new ClaudeError('limit', 'usage limit')
  const c = await s.service.submit('Notes/Extra.md', answers)
  expect(c).toMatchObject({ state: 'pending', answers, error: { code: 'limit', message: 'usage limit' } })
  const restarted = s.make()
  const item = (await restarted.overview()).items.find((i) => i.path === 'Notes/Extra.md')!
  expect(item.status).toBe('unread')
  expect(item.openCheck?.id).toBe(c.id)
  s.claude.fail = undefined
  const r = await restarted.retry('Notes/Extra.md', c.id)
  expect(r).toMatchObject({ state: 'graded', passed: true })
  expect(r.error).toBeUndefined()
})

test('second submit while one is open is refused', async () => {
  const s = setup()
  await s.service.quiz('Notes/Extra.md')
  s.claude.fail = new ClaudeError('failed', 'timeout')
  await s.service.submit('Notes/Extra.md', answers)
  const err = await s.service.submit('Notes/Extra.md', answers).catch((e) => e)
  expect(err.code).toBe('bad-state')
})

test('appeal regrades once', async () => {
  const s = setup()
  await s.service.quiz('Notes/Extra.md')
  s.claude.grades.push([false, false, true], [true, true, true])
  const c = await s.service.submit('Notes/Extra.md', answers)
  const a = await s.service.appeal('Notes/Extra.md', c.id, 'I covered c2')
  expect(a).toMatchObject({ passed: true, appealed: true, appeal: 'I covered c2' })
  expect(s.claude.calls.at(-1)!.prompt).toContain('I covered c2')
  const err = await s.service.appeal('Notes/Extra.md', c.id, 'again').catch((e) => e)
  expect(err.code).toBe('bad-state')
})

test('skip hides a note from up next', async () => {
  const s = setup()
  await s.service.classifyPending()
  expect((await s.service.overview()).upNext).toContain('Notes/Extra.md')
  await s.service.skip('Notes/Extra.md', true)
  expect((await s.service.overview()).upNext).not.toContain('Notes/Extra.md')
  await s.service.skip('Notes/Extra.md', false)
  expect((await s.service.overview()).upNext).toContain('Notes/Extra.md')
})

test('todayReading returns due notes up to the cap', async () => {
  const s = setup({ 'Notes/Third.md': 'third' })
  for (const p of ['Notes/Extra.md', 'Notes/Source.md', 'Notes/Third.md']) {
    await s.service.quiz(p)
    await s.service.submit(p, answers)
  }
  today = '2026-11-01'
  expect(await s.service.todayReading(2)).toHaveLength(2)
  expect(await s.service.todayReading(0)).toEqual([])
})

test('never writes to the vault', async () => {
  const s = setup()
  const snapshot = () => {
    const out: string[] = []
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const f = path.join(d, e.name)
        if (e.isDirectory()) walk(f)
        else out.push(`${f}:${fs.statSync(f).mtimeMs}`)
      }
    }
    walk(s.vault)
    return out.sort()
  }
  const before = snapshot()
  await s.service.classifyPending()
  await s.service.note('Notes/Extra.md')
  await s.service.quiz('Notes/Extra.md')
  s.claude.grades.push([false, false, false], [true, true, true])
  const c = await s.service.submit('Notes/Extra.md', answers)
  await s.service.appeal('Notes/Extra.md', c.id, 'r')
  await s.service.skip('Notes/Source.md', true)
  expect(snapshot()).toEqual(before)
})
