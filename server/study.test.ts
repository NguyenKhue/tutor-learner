import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, test } from 'vitest'
import type { Question } from '../src/lib/types'
import { ClaudeError } from './claude'
import { GRADE_SCHEMA, LESSON_SCHEMA, QUESTIONS_SCHEMA } from './prompts'
import { createStateStore } from './state'
import { createStudyService, StudyError } from './study'
import { makeTestVault } from './testVault'
import { createTutorCli, type TutorCli } from './tutor'

const DATE = '2026-10-22'
const CONCEPT = 'Kotlin/01 Null safety'
const MEMORY = 'Kotlin/02 Keywords'
const NOSRC = 'Kotlin/03 Orphan'

const pre: Question = { q: 'q1', kind: 'pretest', prompt: 'Guess?', criteria: ['types carry nullability'] }
const openQ = (q: string): Question => ({ q, kind: 'open', prompt: `Explain ${q}`, criteria: ['a', 'b'] })
const mcqQ = (q: string): Question => ({ q, kind: 'mcq', prompt: `Pick ${q}`, options: ['w', 'r', 'x', 'y'], answer: 1, misconceptions: ['m-w', '', 'm-x', 'm-y'] })

interface FakeClaude {
  calls: Array<{ prompt: string; schema: object }>
  grades: Array<{ ok: boolean }>
  fail?: ClaudeError
  fn: <T>(prompt: string, schema: object) => Promise<T>
}

function fakeClaude(): FakeClaude {
  const f: FakeClaude = {
    calls: [],
    grades: [],
    fn: async <T>(prompt: string, schema: object): Promise<T> => {
      f.calls.push({ prompt, schema })
      if (f.fail) throw f.fail
      if (schema === LESSON_SCHEMA) return { markdown: '## Lesson\nGenerated.' } as T
      if (schema === QUESTIONS_SCHEMA) {
        const memory = prompt.includes('Keywords')
        return { questions: [pre, ...(memory ? ['q2', 'q3', 'q4'].map(mcqQ) : ['q2', 'q3', 'q4'].map(openQ))] } as T
      }
      if (schema === GRADE_SCHEMA) {
        const ok = f.grades.shift()?.ok ?? true
        return { grade: { ok, why: ok ? 'covers a and b' : 'misses b', missing: ok ? [] : ['b'], feedback: 'fb' }, english: { corrected: 'C', notes: ['n'] } } as T
      }
      throw new Error('unexpected schema')
    },
  }
  return f
}

let cleanups: Array<() => void> = []
afterEach(() => {
  cleanups.forEach((c) => c())
  cleanups = []
})

function setup(opts: { history?: Array<{ d: string; kind: 'learn' | 'review'; ok: boolean; q: string; why: string }>; lesson?: boolean; stateFile?: string; tutor?: (t: TutorCli) => TutorCli } = {}) {
  const v = makeTestVault(
    [
      { topic: 'Kotlin', name: '01 Null safety', type: 'concept', order: 1, sources: ['[[Notes/Null]]'], history: opts.history },
      { topic: 'Kotlin', name: '02 Keywords', type: 'memory', order: 2, sources: ['[[Notes/Null]]'] },
      { topic: 'Kotlin', name: '03 Orphan', type: 'memory', order: 3, sources: ['[[Notes/Missing]]'] },
    ],
    { files: { 'Notes/Null.md': 'NULL-SOURCE', ...(opts.lesson ? { 'Tutor/Lessons/Kotlin/01 Null safety.md': '---\ntutor: lesson\n---\n\nEXISTING' } : {}) } },
  )
  cleanups.push(v.cleanup)
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tutor-data-'))
  cleanups.push(() => fs.rmSync(dataDir, { recursive: true, force: true }))
  const stateFile = opts.stateFile ?? path.join(dataDir, 'state.json')
  const real = createTutorCli({ vault: v.vault })
  const tutor = opts.tutor ? opts.tutor(real) : real
  const claude = fakeClaude()
  let n = 0
  const make = () =>
    createStudyService({ vault: v.vault, vaultName: 'Test Vault', tutor, store: createStateStore(stateFile), claude: claude.fn, today: () => DATE, newId: () => `a${++n}` })
  const history = async (id: string) => (await real.exportData(DATE)).points.find((p) => p.id === id)!.history
  return { vault: v.vault, stateFile, tutor: real, claude, service: make(), make, history }
}

test('reuses an existing lesson without calling claude', async () => {
  const s = setup({ lesson: true })
  const l = await s.service.getLesson(CONCEPT)
  expect(l.markdown).toBe('EXISTING')
  expect(l.obsidianUrl).toBe('obsidian://open?vault=Test%20Vault&file=Tutor%2FLessons%2FKotlin%2F01%20Null%20safety')
  expect(s.claude.calls.length).toBe(0)
})

test('writes a generated lesson under Tutor/Lessons', async () => {
  const s = setup()
  const l = await s.service.getLesson(CONCEPT)
  expect(l.markdown).toContain('Generated.')
  expect(l.missingSources).toEqual([])
  expect(fs.readFileSync(path.join(s.vault, 'Tutor/Lessons/Kotlin/01 Null safety.md'), 'utf8')).toContain('Generated.')
  expect(s.claude.calls[0].prompt).toContain('NULL-SOURCE')
})

test('refuses to generate when no source resolves', async () => {
  const s = setup()
  const err = await s.service.getLesson(NOSRC).catch((e) => e)
  expect(err).toBeInstanceOf(StudyError)
  expect(err.code).toBe('no-sources')
  expect(s.claude.calls.length).toBe(0)
})

test('unknown point is not-found', async () => {
  const err = await setup().service.getBank('Kotlin/99 Nope').catch((e) => e)
  expect(err.code).toBe('not-found')
})

test('bank avoids codes already in history', async () => {
  const s = setup({ history: [{ d: '2026-10-20', kind: 'learn', ok: true, q: 'q2', why: 'x' }] })
  const bank = await s.service.getBank(CONCEPT)
  expect(bank.questions.map((q) => q.q)).toEqual(['q3', 'q4', 'q5', 'q6'])
  await s.service.getBank(CONCEPT)
  expect(s.claude.calls.length).toBe(1)
})

test('regenerateBank avoids old bank codes too', async () => {
  const s = setup()
  await s.service.getBank(CONCEPT)
  const again = await s.service.regenerateBank(CONCEPT)
  expect(again.questions.map((q) => q.q)).toEqual(['q5', 'q6', 'q7', 'q8'])
})

test('mcq answer is graded locally and recorded', async () => {
  const s = setup()
  const bank = await s.service.getBank(MEMORY)
  const callsBefore = s.claude.calls.length
  const a = await s.service.submit({ point: MEMORY, q: bank.questions[1].q, kind: 'learn', answer: '1' })
  expect(a.state).toBe('recorded')
  expect(a.grade!.ok).toBe(true)
  expect(a.record!.status).toBe('learning')
  expect(s.claude.calls.length).toBe(callsBefore)
  expect(await s.history(MEMORY)).toEqual([{ d: DATE, kind: 'learn', ok: true, q: 'q2', why: 'Chose option B; correct is B' }])
})

test('wrong mcq answer records a fail with the misconception as feedback', async () => {
  const s = setup()
  await s.service.getBank(MEMORY)
  const a = await s.service.submit({ point: MEMORY, q: 'q2', kind: 'learn', answer: '2' })
  expect(a.state).toBe('recorded')
  expect(a.grade).toMatchObject({ ok: false, why: 'Chose option C; correct is B', feedback: 'm-x' })
})

test('open answer that passes is recorded with grade.why', async () => {
  const s = setup()
  await s.service.getBank(CONCEPT)
  const a = await s.service.submit({ point: CONCEPT, q: 'q2', kind: 'learn', answer: 'my answer' })
  expect(a.state).toBe('recorded')
  expect(a.english).toEqual({ corrected: 'C', notes: ['n'] })
  expect((await s.history(CONCEPT))[0]).toMatchObject({ ok: true, q: 'q2', why: 'covers a and b' })
  expect(s.claude.calls.at(-1)!.prompt).toContain('my answer')
})

test('english is skipped when the setting is off', async () => {
  const s = setup()
  await s.service.updateSettings({ englishFeedback: false })
  await s.service.getBank(CONCEPT)
  const a = await s.service.submit({ point: CONCEPT, q: 'q2', kind: 'learn', answer: 'x' })
  expect(a.english).toBeUndefined()
  expect(s.claude.calls.at(-1)!.prompt).toContain('"english": null')
})

test('failed open answer waits for confirm', async () => {
  const s = setup()
  await s.service.getBank(CONCEPT)
  s.claude.grades.push({ ok: false })
  const a = await s.service.submit({ point: CONCEPT, q: 'q2', kind: 'learn', answer: 'x' })
  expect(a.state).toBe('graded')
  expect(await s.history(CONCEPT)).toEqual([])
  const c = await s.service.confirm(a.id)
  expect(c.state).toBe('recorded')
  expect(await s.history(CONCEPT)).toHaveLength(1)
  expect((await s.history(CONCEPT))[0].ok).toBe(false)
})

test('appeal regrades once and records', async () => {
  const s = setup()
  await s.service.getBank(CONCEPT)
  s.claude.grades.push({ ok: false }, { ok: true })
  const a = await s.service.submit({ point: CONCEPT, q: 'q2', kind: 'learn', answer: 'x' })
  const b = await s.service.appeal(a.id, 'I covered b')
  expect(b).toMatchObject({ state: 'recorded', appealed: true, appeal: 'I covered b' })
  expect(b.grade!.ok).toBe(true)
  expect(s.claude.calls.at(-1)!.prompt).toContain('I covered b')
  expect(await s.history(CONCEPT)).toHaveLength(1)
})

test('second appeal is rejected', async () => {
  const s = setup()
  await s.service.getBank(CONCEPT)
  s.claude.grades.push({ ok: false }, { ok: false })
  const a = await s.service.submit({ point: CONCEPT, q: 'q2', kind: 'learn', answer: 'x' })
  await s.service.appeal(a.id, 'r1')
  const err = await s.service.appeal(a.id, 'r2').catch((e) => e)
  expect(err).toBeInstanceOf(StudyError)
  expect(err.code).toBe('bad-state')
})

test('limit error keeps the attempt pending with code limit', async () => {
  const s = setup()
  await s.service.getBank(CONCEPT)
  s.claude.fail = new ClaudeError('limit', 'usage limit reached')
  const a = await s.service.submit({ point: CONCEPT, q: 'q2', kind: 'learn', answer: 'saved answer' })
  expect(a.state).toBe('pending')
  expect(a.error).toEqual({ code: 'limit', message: 'usage limit reached' })
  expect(a.answer).toBe('saved answer')
  expect(await s.history(CONCEPT)).toEqual([])
  s.claude.fail = undefined
  const r = await s.service.retry(a.id)
  expect(r.state).toBe('recorded')
  expect(r.error).toBeUndefined()
})

test('keeps graded attempt when record fails and records once on retry', async () => {
  let failOnce = true
  const s = setup({
    tutor: (t) => ({
      ...t,
      record: async (a) => {
        if (failOnce) {
          failOnce = false
          throw new Error('disk busy')
        }
        return t.record(a)
      },
    }),
  })
  await s.service.getBank(CONCEPT)
  const a = await s.service.submit({ point: CONCEPT, q: 'q2', kind: 'learn', answer: 'x' })
  expect(a.state).toBe('graded')
  expect(a.error).toEqual({ code: 'record', message: 'disk busy' })
  const gradeCalls = s.claude.calls.length
  const r = await s.service.retry(a.id)
  expect(r.state).toBe('recorded')
  expect(s.claude.calls.length).toBe(gradeCalls)
  expect(await s.history(CONCEPT)).toHaveLength(1)
})

test('recovers pending and graded attempts after restart', async () => {
  const s = setup()
  await s.service.getBank(CONCEPT)
  s.claude.fail = new ClaudeError('failed', 'timeout')
  const a = await s.service.submit({ point: CONCEPT, q: 'q2', kind: 'learn', answer: 'x' })
  s.claude.fail = undefined
  const restarted = s.make()
  expect((await restarted.openAttempts()).map((x) => x.id)).toEqual([a.id])
  expect((await restarted.retry(a.id)).state).toBe('recorded')
  expect(await restarted.openAttempts()).toEqual([])
})

test('rejects a second submit for the same attempt', async () => {
  const s = setup()
  await s.service.getBank(CONCEPT)
  s.claude.grades.push({ ok: true })
  const [first, second] = await Promise.allSettled([
    s.service.submit({ point: CONCEPT, q: 'q2', kind: 'learn', answer: 'x' }),
    s.service.submit({ point: CONCEPT, q: 'q2', kind: 'learn', answer: 'x' }),
  ])
  expect(first.status).toBe('fulfilled')
  expect(second.status).toBe('rejected')
  expect((second as PromiseRejectedResult).reason.code).toBe('bad-state')
  const done = (first as PromiseFulfilledResult<{ id: string }>).value
  const err = await s.service.retry(done.id).catch((e) => e)
  expect(err.code).toBe('bad-state')
  expect(await s.history(CONCEPT)).toHaveLength(1)
})

test('submit for a question not in the bank is rejected', async () => {
  const s = setup()
  await s.service.getBank(CONCEPT)
  const err = await s.service.submit({ point: CONCEPT, q: 'q1', kind: 'learn', answer: 'x' }).catch((e) => e)
  expect(err.code).toBe('bad-state')
})

test('pickQuestion gives a different code after one ok on a concept point', async () => {
  const s = setup({ history: [{ d: '2026-10-20', kind: 'learn', ok: true, q: 'q2', why: 'x' }] })
  const bank = { point: CONCEPT, created: DATE, questions: [pre, openQ('q2'), openQ('q3'), openQ('q4')] }
  const point = (await s.tutor.exportData(DATE)).points.find((p) => p.id === CONCEPT)!
  expect(s.service.pickQuestion(point, bank, 'learn').q).toBe('q3')
})

test('pickQuestion for review prefers the code answered longest ago', async () => {
  const s = setup({
    history: [
      { d: '2026-10-10', kind: 'learn', ok: true, q: 'q3', why: 'x' },
      { d: '2026-10-11', kind: 'learn', ok: true, q: 'q2', why: 'x' },
      { d: '2026-10-12', kind: 'review', ok: true, q: 'q4', why: 'x' },
    ],
  })
  const bank = { point: CONCEPT, created: DATE, questions: [pre, openQ('q2'), openQ('q3'), openQ('q4')] }
  const point = (await s.tutor.exportData(DATE)).points.find((p) => p.id === CONCEPT)!
  expect(s.service.pickQuestion(point, bank, 'review').q).toBe('q3')
})

test('pretest never writes history', async () => {
  const s = setup()
  await s.service.getBank(CONCEPT)
  const idk = await s.service.submitPretest(CONCEPT, null)
  expect(idk.feedback).toBe('Key idea: types carry nullability')
  const calls = s.claude.calls.length
  await s.service.submitPretest(CONCEPT, 'my guess')
  expect(s.claude.calls.length).toBe(calls + 1)
  expect(await s.history(CONCEPT)).toEqual([])
})

test('prefetch prepares lessons and banks in the background', async () => {
  const s = setup()
  await s.service.prefetch([CONCEPT, NOSRC])
  expect(fs.existsSync(path.join(s.vault, 'Tutor/Lessons/Kotlin/01 Null safety.md'))).toBe(true)
  expect((await createStateStore(s.stateFile).read()).banks[CONCEPT]).toBeDefined()
})

test('regenerateBank is refused while the point has an open attempt', async () => {
  const s = setup()
  await s.service.getBank(CONCEPT)
  s.claude.fail = new ClaudeError('failed', 'timeout')
  await s.service.submit({ point: CONCEPT, q: 'q2', kind: 'learn', answer: 'x' })
  s.claude.fail = undefined
  const err = await s.service.regenerateBank(CONCEPT).catch((e) => e)
  expect(err.code).toBe('bad-state')
})
