import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { App } from '../app/App'
import type { Attempt, Question, RecordResult } from '../lib/types'
import { goTo, mockApi } from '../test/api'
import { makeOverview, makePoint } from '../test/fixtures'

afterEach(() => vi.unstubAllGlobals())

const ID = 'Kotlin Language/01 Null safety'
const URL_LEARN = `/study/${encodeURIComponent(ID)}?kind=learn`
const URL_REVIEW = `/study/${encodeURIComponent(ID)}?kind=review`
const pre: Question = { q: 'q1', kind: 'pretest', prompt: 'What do you already know?', criteria: ['k'] }
const open: Question = { q: 'q2', kind: 'open', prompt: 'Explain null safety.', criteria: ['a', 'b'] }
const mcq: Question = { q: 'q2', kind: 'mcq', prompt: 'Pick one.', options: ['Alpha', 'Beta', 'Gamma', 'Delta'], answer: 1, misconceptions: ['m', '', 'm', 'm'] }
const lesson = { markdown: '## How it works\n\nNullability is in the **type system**.\n\n- one\n- two\n\n```kotlin\nval s: String? = null\n```', missingSources: [], obsidianUrl: 'obsidian://open?vault=V&file=Tutor%2FLessons%2Fx' }

const record = (passed = false): RecordResult => ({ point: ID, mastery: passed ? 0.8 : 0.5, status: passed ? 'mastered' : 'learning', passed_gate: passed, box: passed ? 0 : null, next_review: passed ? '2026-10-25' : null })
const attempt = (over: Partial<Attempt> = {}): Attempt => ({
  id: 'a1', point: ID, q: 'q2', kind: 'learn', answer: 'my answer', date: '2026-10-22', state: 'recorded',
  grade: { ok: true, why: 'covers both', missing: [], feedback: 'Nice.' }, record: record(), ...over,
})

function routes(question: Question, extra: Record<string, unknown> = {}) {
  return {
    'GET /api/overview': makeOverview({ export: { ...makeOverview().export, points: [makePoint(ID)] }, list: { date: '2026-10-22', review: [], fresh: [ID], extra: [] } }),
    'GET /api/open-attempts': [],
    'GET /api/bank': { point: ID, created: '2026-10-22', questions: [pre, question] },
    'GET /api/question': question,
    'GET /api/lesson': lesson,
    'POST /api/pretest': { feedback: 'Good guess.' },
    'POST /api/answer': attempt(),
    ...extra,
  }
}

test('learn flow goes pretest, lesson, question, result', async () => {
  const calls = mockApi(routes(open))
  goTo(URL_LEARN)
  render(<App />)
  expect(await screen.findByText('What do you already know?')).toBeInTheDocument()
  await userEvent.type(screen.getByRole('textbox'), 'a guess')
  await userEvent.click(screen.getByRole('button', { name: 'Check' }))
  expect(await screen.findByText('Good guess.')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Read the lesson' }))
  expect(await screen.findByRole('heading', { name: 'How it works' })).toBeInTheDocument()
  expect(screen.getByText('type system').tagName).toBe('STRONG')
  expect(screen.getByRole('link', { name: 'Open in Obsidian' })).toHaveAttribute('href', lesson.obsidianUrl)
  await userEvent.click(screen.getByRole('button', { name: 'Answer the question' }))
  expect(await screen.findByText('Explain null safety.')).toBeInTheDocument()
  await userEvent.type(screen.getByRole('textbox'), 'my answer')
  await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
  expect(await screen.findByText('Correct')).toBeInTheDocument()
  expect(screen.getByText('covers both')).toBeInTheDocument()
  expect(screen.queryByText('Mastered!')).toBeNull()
  const sent = calls.find((c) => c.path === '/api/answer')!
  expect(sent.body).toEqual({ point: ID, q: 'q2', kind: 'learn', answer: 'my answer' })
  expect(calls.find((c) => c.path === '/api/pretest')!.body).toEqual({ point: ID, answer: 'a guess' })
})

test('i do not know yet skips the guess', async () => {
  const calls = mockApi(routes(open))
  goTo(URL_LEARN)
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: "I don't know yet" }))
  await screen.findByText('Good guess.')
  expect(calls.find((c) => c.path === '/api/pretest')!.body).toEqual({ point: ID, answer: null })
})

test('review flow skips pretest and lesson', async () => {
  mockApi(routes(open))
  goTo(URL_REVIEW)
  render(<App />)
  expect(await screen.findByText('Explain null safety.')).toBeInTheDocument()
  expect(screen.queryByText('What do you already know?')).toBeNull()
  expect(screen.queryByRole('heading', { name: 'How it works' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Show lesson' })).toBeInTheDocument()
})

test('shows lesson after a wrong review answer', async () => {
  mockApi(routes(mcq, { 'POST /api/answer': attempt({ kind: 'review', grade: { ok: false, why: 'Chose option A; correct is B', missing: [], feedback: 'm' } }) }))
  goTo(URL_REVIEW)
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: /Alpha/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
  expect(await screen.findByText('Not yet')).toBeInTheDocument()
  expect(await screen.findByRole('heading', { name: 'How it works' })).toBeInTheDocument()
})

test('mcq answers with number keys', async () => {
  const calls = mockApi(routes(mcq))
  goTo(URL_REVIEW)
  render(<App />)
  await screen.findByText('Pick one.')
  await userEvent.keyboard('2')
  expect(screen.getByRole('button', { name: /Beta/ })).toHaveAttribute('aria-pressed', 'true')
  await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
  await screen.findByText('Correct')
  expect(calls.find((c) => c.path === '/api/answer')!.body).toMatchObject({ answer: '1', kind: 'review' })
})

test('shows Mastered only when passed_gate', async () => {
  mockApi(routes(open, { 'POST /api/answer': attempt({ record: record(true) }) }))
  goTo(URL_REVIEW)
  render(<App />)
  await userEvent.type(await screen.findByRole('textbox'), 'x')
  await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
  expect(await screen.findByText('Mastered!')).toBeInTheDocument()
  expect(screen.getByText('80%')).toBeInTheDocument()
  expect(screen.getByText(/2026-10-25/)).toBeInTheDocument()
})

test('failed open answer offers continue and appeal', async () => {
  const graded = attempt({ state: 'graded', record: undefined, grade: { ok: false, why: 'misses b', missing: ['b'], feedback: 'Add b.' } })
  const calls = mockApi(routes(open, {
    'POST /api/answer': graded,
    'POST /api/attempt/confirm': attempt({ state: 'recorded', grade: graded.grade }),
    'POST /api/attempt/appeal': attempt({ state: 'recorded', appealed: true, appeal: 'I said b' }),
  }))
  goTo(URL_REVIEW)
  render(<App />)
  await userEvent.type(await screen.findByRole('textbox'), 'x')
  await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
  expect(await screen.findByText('Not yet')).toBeInTheDocument()
  expect(screen.getByText('b')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'I think this is right' }))
  await userEvent.type(screen.getByRole('textbox', { name: 'Why your answer is right' }), 'I said b')
  await userEvent.click(screen.getByRole('button', { name: 'Send' }))
  expect(await screen.findByText('Correct')).toBeInTheDocument()
  expect(calls.find((c) => c.path === '/api/attempt/appeal')!.body).toEqual({ id: 'a1', reason: 'I said b' })
})

test('appeal button disappears after one appeal', async () => {
  const graded = attempt({ state: 'graded', record: undefined, grade: { ok: false, why: 'w', missing: [], feedback: 'f' } })
  mockApi(routes(open, {
    'POST /api/answer': graded,
    'POST /api/attempt/appeal': { ...graded, appealed: true, appeal: 'r', state: 'recorded', record: record() },
  }))
  goTo(URL_REVIEW)
  render(<App />)
  await userEvent.type(await screen.findByRole('textbox'), 'x')
  await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
  await userEvent.click(await screen.findByRole('button', { name: 'I think this is right' }))
  await userEvent.type(screen.getByRole('textbox', { name: 'Why your answer is right' }), 'r')
  await userEvent.click(screen.getByRole('button', { name: 'Send' }))
  await waitFor(() => expect(screen.queryByRole('button', { name: 'I think this is right' })).toBeNull())
})

test('limit error keeps the answer and offers grade again', async () => {
  const pending = attempt({ state: 'pending', grade: undefined, record: undefined, error: { code: 'limit', message: 'usage limit' } })
  const calls = mockApi(routes(open, { 'POST /api/answer': pending, 'POST /api/attempt/retry': attempt() }))
  goTo(URL_REVIEW)
  render(<App />)
  await userEvent.type(await screen.findByRole('textbox'), 'my answer')
  await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
  expect(await screen.findByText(/Claude usage limit reached\. Your answer is saved\./)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Grade again' }))
  expect(await screen.findByText('Correct')).toBeInTheDocument()
  expect(calls.find((c) => c.path === '/api/attempt/retry')!.body).toEqual({ id: 'a1' })
})

test('record error offers save result', async () => {
  const graded = attempt({ state: 'graded', record: undefined, error: { code: 'record', message: 'disk' } })
  mockApi(routes(open, { 'POST /api/answer': graded, 'POST /api/attempt/retry': attempt() }))
  goTo(URL_REVIEW)
  render(<App />)
  await userEvent.type(await screen.findByRole('textbox'), 'x')
  await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
  expect(await screen.findByText(/Could not save the result\./)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Save result' }))
  expect(await screen.findByText(/mastery/i)).toBeInTheDocument()
})

test('english panel hidden when attempt has no english', async () => {
  mockApi(routes(open))
  goTo(URL_REVIEW)
  render(<App />)
  await userEvent.type(await screen.findByRole('textbox'), 'x')
  await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
  await screen.findByText('Correct')
  expect(screen.queryByRole('region', { name: 'English' })).toBeNull()
})

test('english panel shows the corrected answer', async () => {
  mockApi(routes(open, { 'POST /api/answer': attempt({ english: { corrected: 'Kotlin puts nullability in the type system.', notes: ['Use "puts".'] } }) }))
  goTo(URL_REVIEW)
  render(<App />)
  await userEvent.type(await screen.findByRole('textbox'), 'x')
  await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
  const panel = await screen.findByRole('region', { name: 'English' })
  expect(panel).toHaveTextContent('Kotlin puts nullability in the type system.')
  expect(panel).toHaveTextContent('Use "puts".')
})

test('resumes an open attempt on load', async () => {
  const pending = attempt({ state: 'pending', grade: undefined, record: undefined, error: { code: 'failed', message: 'timeout' } })
  mockApi(routes(open, { 'GET /api/open-attempts': [pending] }))
  goTo(URL_LEARN)
  render(<App />)
  expect(await screen.findByText(/Grading failed\. Your answer is saved\./)).toBeInTheDocument()
  expect(screen.getByText('my answer')).toBeInTheDocument()
  expect(screen.queryByText('What do you already know?')).toBeNull()
})

test('no sources shows the missing links', async () => {
  mockApi(routes(open, { 'GET /api/lesson': { status: 422, body: { error: 'No source note found: [[Gone]]', code: 'no-sources' } } }))
  goTo(URL_REVIEW)
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: 'Show lesson' }))
  expect(await screen.findByText(/No source note found: \[\[Gone\]\]/)).toBeInTheDocument()
})

test('reloads overview after a recorded answer', async () => {
  const calls = mockApi(routes(open))
  goTo(URL_REVIEW)
  render(<App />)
  await userEvent.type(await screen.findByRole('textbox'), 'x')
  await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
  await screen.findByText('Correct')
  await waitFor(() => expect(calls.filter((c) => c.path === '/api/overview').length).toBeGreaterThanOrEqual(2))
})

test('a pending attempt without an error can be graded again', async () => {
  const pending = attempt({ state: 'pending', grade: undefined, record: undefined, error: undefined })
  const calls = mockApi(routes(open, { 'GET /api/open-attempts': [pending], 'POST /api/attempt/retry': attempt() }))
  goTo(URL_LEARN)
  render(<App />)
  expect(await screen.findByText('my answer')).toBeInTheDocument()
  expect(screen.getByText(/not graded yet/i)).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Grade again' }))
  expect(await screen.findByText('Correct')).toBeInTheDocument()
  expect(calls.find((c) => c.path === '/api/attempt/retry')!.body).toEqual({ id: 'a1' })
})
