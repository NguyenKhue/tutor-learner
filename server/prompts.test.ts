import { expect, test } from 'vitest'
import type { Point, Question } from '../src/lib/types'
import { ClaudeError } from './claude'
import {
  GRADE_SCHEMA, LESSON_SCHEMA, QUESTIONS_SCHEMA, buildGradePrompt, buildLessonPrompt, buildQuestionsPrompt, pointTitle, validateBank,
  type PromptContext,
} from './prompts'

const point = (type: Point['type']): Point => ({
  id: 'Kotlin/01 Null safety', topic: 'Kotlin', type, interview: true, order: 1, sources: ['[[A]]'],
  status: 'new', mastery: 0, box: null, next_review: null, history: [],
})
const ctx = (type: Point['type'] = 'concept'): PromptContext => ({
  point: point(type), title: 'Null safety', pointQuestion: 'How does null safety work?', scope: 'Safe call, Elvis, !!.',
  sources: [{ link: '[[A]]', text: 'SOURCE-TEXT-A' }, { link: '[[B]]', text: 'SOURCE-TEXT-B' }],
})
const mcq = (q: string): Question => ({ q, kind: 'mcq', prompt: 'p', options: ['a', 'b', 'c', 'd'], answer: 1, misconceptions: ['m0', '', 'm2', 'm3'] })
const open = (q: string): Question => ({ q, kind: 'open', prompt: 'p', criteria: ['c1', 'c2'] })
const pre = (q: string): Question => ({ q, kind: 'pretest', prompt: 'p', criteria: ['k1'] })

test('pointTitle drops the number prefix', () => {
  expect(pointTitle('Kotlin/01 Null safety')).toBe('Null safety')
})

test('schemas are objects with required keys', () => {
  expect(LESSON_SCHEMA).toMatchObject({ type: 'object', required: ['markdown'] })
  expect(QUESTIONS_SCHEMA).toMatchObject({ type: 'object', required: ['questions'] })
  expect(GRADE_SCHEMA).toMatchObject({ type: 'object', required: ['grade', 'english'] })
})

test('lesson prompt contains every source text and the point scope', () => {
  const p = buildLessonPrompt(ctx())
  for (const s of ['SOURCE-TEXT-A', 'SOURCE-TEXT-B', 'Safe call, Elvis, !!.', 'How does null safety work?', 'English']) expect(p).toContain(s)
})

test('questions prompt asks for mcq on memory and open on concept and lists avoided codes', () => {
  expect(buildQuestionsPrompt(ctx('memory'), [])).toContain('mcq')
  const c = buildQuestionsPrompt(ctx('concept'), ['q1', 'q2'])
  expect(c).toContain('open')
  expect(c).toContain('SOURCE-TEXT-A')
})

test('grade prompt includes criteria for open questions', () => {
  const p = buildGradePrompt({ ...ctx(), question: open('q1'), answer: 'MY-ANSWER', english: true })
  expect(p).toContain('c1')
  expect(p).toContain('c2')
  expect(p).toContain('MY-ANSWER')
  expect(p).toContain('english')
})

test('grade prompt omits English instructions when english is false', () => {
  const p = buildGradePrompt({ ...ctx(), question: open('q1'), answer: 'x', english: false })
  expect(p).toContain('"english": null')
  expect(p).not.toContain('corrected')
})

test('grade prompt shows the point question as text', () => {
  const p = buildGradePrompt({ ...ctx(), question: open('q1'), answer: 'x', english: false })
  expect(p).toContain('How does null safety work?')
  expect(p).not.toContain('[object Object]')
})

test('grade prompt with appeal includes the argument', () => {
  const p = buildGradePrompt({ ...ctx(), question: open('q1'), answer: 'x', english: false, appeal: 'MY-REASON' })
  expect(p).toContain('MY-REASON')
})

test('validateBank renumbers after avoided codes', () => {
  const bank = validateBank('concept', { questions: [pre('a'), open('b'), open('c'), open('d')] }, ['q1', 'q2'])
  expect(bank.map((q) => q.q)).toEqual(['q3', 'q4', 'q5', 'q6'])
  expect(bank[0].kind).toBe('pretest')
})

test('validateBank accepts a memory bank of mcq', () => {
  expect(validateBank('memory', { questions: [pre('x'), mcq('x'), mcq('y'), mcq('z')] }, []).map((q) => q.q)).toEqual(['q1', 'q2', 'q3', 'q4'])
})

test('validateBank rejects an mcq with 3 options', () => {
  const bad = { ...mcq('b'), options: ['a', 'b', 'c'] }
  expect(() => validateBank('memory', { questions: [pre('a'), bad, mcq('c'), mcq('d')] }, [])).toThrow(ClaudeError)
})

test('validateBank rejects a concept bank that uses mcq', () => {
  expect(() => validateBank('concept', { questions: [pre('a'), mcq('b'), open('c'), open('d')] }, [])).toThrow(ClaudeError)
})

test('validateBank rejects a bank without exactly one pretest', () => {
  expect(() => validateBank('concept', { questions: [open('b'), open('c'), open('d')] }, [])).toThrow(ClaudeError)
})
