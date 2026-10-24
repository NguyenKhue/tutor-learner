import { expect, test } from 'vitest'
import { ClaudeError } from '../claude'
import { buildClassifyPrompt, buildReadingGradePrompt, cleanClassification, validateReadingGrade, validateReadingQuiz } from './prompts'

const open = (q: string, n = 2) => ({ q, kind: 'open' as const, prompt: `P ${q}`, criteria: Array.from({ length: n }, (_, i) => `c${i}`) })

test('classify prompt lists topics and paths', () => {
  const p = buildClassifyPrompt([{ path: 'A/x.md', title: 'x', head: 'HEAD' }], [{ name: 'Kotlin Language', hint: 'Books/Kotlin' }])
  expect(p).toContain('- Kotlin Language — Books/Kotlin')
  expect(p).toContain('PATH: A/x.md')
  expect(p).toContain('HEAD')
})

test('cleanClassification nulls unknown topics and fixes priority', () => {
  expect(cleanClassification({ topic: 'Gardening', priority: 'urgent', minutes: 0.2, why: ' w ' }, ['Kotlin'])).toEqual({ topic: null, priority: 'low', minutes: 1, why: 'w' })
  expect(cleanClassification({ topic: 'Kotlin', priority: 'high', minutes: 7, why: '' }, ['Kotlin'])).toMatchObject({ topic: 'Kotlin', priority: 'high', minutes: 7 })
})

test('validateReadingQuiz renumbers and rejects bad quizzes', () => {
  expect(validateReadingQuiz({ questions: [open('a'), open('b'), open('c', 4)] }).map((q) => q.q)).toEqual(['r1', 'r2', 'r3'])
  expect(() => validateReadingQuiz({ questions: [open('a'), open('b')] })).toThrow(ClaudeError)
  expect(() => validateReadingQuiz({ questions: [open('a'), open('b'), open('c', 1)] })).toThrow(ClaudeError)
})

test('grade prompt includes answers, criteria, english switch and appeal', () => {
  const qs = validateReadingQuiz({ questions: [open('a'), open('b'), open('c')] })
  const p = buildReadingGradePrompt({ title: 'T', text: 'NOTE', questions: qs, answers: { r1: 'ANS1', r2: 'ANS2', r3: 'ANS3' }, english: false, appeal: 'MY REASON' })
  for (const s of ['ANS1', 'ANS3', 'c1', 'NOTE', '"english": null', 'MY REASON']) expect(p).toContain(s)
  expect(buildReadingGradePrompt({ title: 'T', text: 'N', questions: qs, answers: {}, english: true })).toContain('corrected')
})

test('validateReadingGrade matches results to questions', () => {
  const qs = validateReadingQuiz({ questions: [open('a'), open('b'), open('c')] })
  const r = validateReadingGrade({ results: [{ q: 'r2', ok: false, why: 'w', missing: [], feedback: 'f' }, { q: 'r1', ok: true, why: '', missing: [], feedback: '' }, { q: 'r3', ok: true, why: '', missing: [], feedback: '' }] }, qs)
  expect(r.map((x) => [x.q, x.ok])).toEqual([['r1', true], ['r2', false], ['r3', true]])
  expect(() => validateReadingGrade({ results: [] }, qs)).toThrow(ClaudeError)
})
