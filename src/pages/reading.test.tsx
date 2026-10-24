import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { App } from '../app/App'
import type { ReadingCheck, ReadingItem, ReadingOverview } from '../lib/types'
import { goTo, mockApi } from '../test/api'
import { makeOverview, makePoint } from '../test/fixtures'

afterEach(() => vi.unstubAllGlobals())

const A = 'Android/Coroutines/Structured concurrency.md'
const B = 'Books/Kotlin/Chapter 2.md'
const enc = encodeURIComponent

const item = (path: string, over: Partial<ReadingItem> = {}): ReadingItem => ({
  path, title: path.split('/').pop()!.replace(/\.md$/, ''), chars: 4000, mtime: 0, hash: 'h', topic: 'Kotlin Language', priority: 'high',
  minutes: 6, why: 'Explains how scopes cancel children.', classifiedHash: 'h', isSource: false, present: true,
  status: 'unread', skipped: false, nextCheck: null, rung: 0, openCheck: null, ...over,
})

function reading(over: Partial<ReadingOverview> = {}): ReadingOverview {
  return {
    items: [item(A), item(B, { topic: 'Coroutines and Flow', status: 'understood', rung: 1, nextCheck: '2026-10-24' })],
    upNext: [A],
    due: [B],
    classify: { total: 2, done: 2, running: false, error: null },
    ...over,
  }
}

const quiz = { hash: 'h', questions: ['r1', 'r2', 'r3'].map((q) => ({ q, kind: 'open', prompt: `Question ${q}?`, criteria: ['x', 'y'] })) }
const graded = (over: Partial<ReadingCheck> = {}): ReadingCheck => ({
  id: 'c1', date: '2026-10-24', kind: 'first', quizHash: 'h', answers: { r1: 'a1', r2: 'a2', r3: 'a3' }, state: 'graded', passed: true,
  results: ['r1', 'r2', 'r3'].map((q) => ({ q, ok: true, why: `why ${q}`, missing: [], feedback: `fb ${q}` })), ...over,
})

function base(extra: Record<string, unknown> = {}) {
  return {
    'GET /api/overview': makeOverview({ today: '2026-10-24' }),
    'GET /api/reading': reading(),
    'GET /api/reading/note': { markdown: '# Scopes\n\nA scope **owns** its children.\n\n![[scope.png]]\n\nSee [[Chapter 2]].', entry: item(A) },
    'POST /api/reading/quiz': quiz,
    'POST /api/reading/check': graded(),
    ...extra,
  }
}

test('reading page shows up next, due and progress', async () => {
  mockApi(base())
  goTo('/reading')
  render(<App />)
  const next = await screen.findByRole('region', { name: 'Up next' })
  expect(within(next).getByRole('link', { name: 'Structured concurrency' })).toHaveAttribute('href', `/read/${enc(A)}`)
  expect(within(next).getByText('Explains how scopes cancel children.')).toBeInTheDocument()
  expect(within(next).getByText('~6 min')).toBeInTheDocument()
  const due = screen.getByRole('region', { name: 'Due for recheck' })
  expect(within(due).getByRole('link', { name: 'Chapter 2' })).toBeInTheDocument()
  const progress = screen.getByRole('region', { name: 'Progress by topic' })
  const row = within(progress).getAllByRole('row').find((r) => r.textContent?.includes('Coroutines and Flow'))!
  expect(row).toHaveTextContent('1')
  expect(screen.getByText('Classified 2 / 2')).toBeInTheDocument()
})

test('skip calls the api and reloads', async () => {
  let skipped = false
  const calls = mockApi(base({
    'GET /api/reading': () => (skipped ? reading({ upNext: [] }) : reading()),
    'POST /api/reading/skip': () => {
      skipped = true
      return { ok: true }
    },
  }))
  goTo('/reading')
  render(<App />)
  const next = await screen.findByRole('region', { name: 'Up next' })
  await userEvent.click(within(next).getByRole('button', { name: 'Skip' }))
  await waitFor(() => expect(within(screen.getByRole('region', { name: 'Up next' })).queryByRole('link', { name: 'Structured concurrency' })).toBeNull())
  expect(calls.find((c) => c.path === '/api/reading/skip')!.body).toEqual({ path: A, skipped: true })
})

test('build reading list starts classification', async () => {
  const calls = mockApi(base({
    'GET /api/reading': reading({ items: [item(A, { topic: undefined, classifiedHash: undefined })], upNext: [], due: [], classify: { total: 1, done: 0, running: false, error: null } }),
    'POST /api/reading/classify': reading({ classify: { total: 1, done: 0, running: true, error: null } }),
  }))
  goTo('/reading')
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: 'Build reading list' }))
  expect(await screen.findByText(/Classifying/)).toBeInTheDocument()
  expect(calls.some((c) => c.method === 'POST' && c.path === '/api/reading/classify')).toBe(true)
})

test('classification error is shown', async () => {
  mockApi(base({ 'GET /api/reading': reading({ classify: { total: 2, done: 1, running: false, error: 'usage limit' } }) }))
  goTo('/reading')
  render(<App />)
  expect(await screen.findByText(/usage limit/)).toBeInTheDocument()
})

test('read page renders markdown with an image from the vault', async () => {
  mockApi(base())
  goTo(`/read/${enc(A)}`)
  render(<App />)
  expect(await screen.findByRole('heading', { name: 'Scopes' })).toBeInTheDocument()
  expect(screen.getByText('owns').tagName).toBe('STRONG')
  expect(screen.getByRole('img', { name: 'scope.png' })).toHaveAttribute('src', `/api/vault-image?note=${enc(A)}&src=${enc('scope.png')}`)
  expect(screen.getByRole('link', { name: 'Chapter 2' })).toHaveAttribute('href', `/read/${enc(B)}`)
  expect(screen.getByRole('link', { name: 'Open in Obsidian' })).toHaveAttribute('href', `obsidian://open?vault=Khue%20Vault&file=${enc(A.replace(/\.md$/, ''))}`)
})

test('quiz flow submits three answers and shows passed', async () => {
  const calls = mockApi(base())
  goTo(`/read/${enc(A)}`)
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: "I've read it" }))
  for (const q of ['r1', 'r2', 'r3']) await userEvent.type(await screen.findByRole('textbox', { name: `Question ${q}?` }), `answer ${q}`)
  await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
  expect(await screen.findByText('Passed')).toBeInTheDocument()
  expect(screen.getByText('fb r2')).toBeInTheDocument()
  expect(calls.find((c) => c.path === '/api/reading/check')!.body).toEqual({ path: A, answers: { r1: 'answer r1', r2: 'answer r2', r3: 'answer r3' } })
})

test('a due note goes straight to the quiz', async () => {
  mockApi(base({ 'GET /api/reading/note': { markdown: '# B', entry: item(B) }, 'GET /api/reading': reading() }))
  goTo(`/read/${enc(B)}`)
  render(<App />)
  expect(await screen.findByRole('textbox', { name: 'Question r1?' })).toBeInTheDocument()
})

test('failed check offers appeal once', async () => {
  const failed = graded({ passed: false, results: ['r1', 'r2', 'r3'].map((q) => ({ q, ok: q === 'r1', why: 'w', missing: q === 'r1' ? [] : ['y'], feedback: 'f' })) })
  const calls = mockApi(base({ 'POST /api/reading/check': failed, 'POST /api/reading/check/appeal': graded({ appealed: true, appeal: 'I said y' }) }))
  goTo(`/read/${enc(A)}`)
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: "I've read it" }))
  for (const q of ['r1', 'r2', 'r3']) await userEvent.type(await screen.findByRole('textbox', { name: `Question ${q}?` }), 'x')
  await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
  expect(await screen.findByText('Read again in 2 days')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'I think this is right' }))
  await userEvent.type(screen.getByRole('textbox', { name: 'Why your answers are right' }), 'I said y')
  await userEvent.click(screen.getByRole('button', { name: 'Send' }))
  expect(await screen.findByText('Passed')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'I think this is right' })).toBeNull()
  expect(calls.find((c) => c.path === '/api/reading/check/appeal')!.body).toEqual({ path: A, id: 'c1', reason: 'I said y' })
})

test('grading error keeps answers and offers grade again', async () => {
  const pending = graded({ state: 'pending', passed: undefined, results: undefined, error: { code: 'limit', message: 'usage limit' } })
  const calls = mockApi(base({ 'POST /api/reading/check': pending, 'POST /api/reading/check/retry': graded() }))
  goTo(`/read/${enc(A)}`)
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: "I've read it" }))
  for (const q of ['r1', 'r2', 'r3']) await userEvent.type(await screen.findByRole('textbox', { name: `Question ${q}?` }), 'x')
  await userEvent.click(screen.getByRole('button', { name: 'Submit' }))
  expect(await screen.findByText(/Claude usage limit reached\. Your answers are saved\./)).toBeInTheDocument()
  expect(screen.getByText('a2')).toBeInTheDocument()
  await userEvent.click(screen.getByRole('button', { name: 'Grade again' }))
  expect(await screen.findByText('Passed')).toBeInTheDocument()
  expect(calls.find((c) => c.path === '/api/reading/check/retry')!.body).toEqual({ path: A, id: 'c1' })
})

test('today shows reading review and counts it', async () => {
  const P = 'Kotlin Language/01 Null safety'
  mockApi({
    'GET /api/overview': makeOverview({
      today: '2026-10-24',
      export: { ...makeOverview().export, points: [makePoint(P)] },
      list: { date: '2026-10-24', review: [], fresh: [P], extra: [], reading: [A, B] },
      reading: { [A]: { title: 'Structured concurrency', topic: 'Kotlin Language', done: true, kind: 'recheck' }, [B]: { title: 'Chapter 2', topic: null, done: false, kind: 'reread' } },
    }),
  })
  goTo('/')
  render(<App />)
  const region = await screen.findByRole('region', { name: 'Reading review' })
  expect(within(region).getByRole('link', { name: 'Structured concurrency' })).toHaveAttribute('href', `/read/${enc(A)}`)
  expect(within(region).getByText('read again')).toBeInTheDocument()
  expect(within(within(region).getAllByRole('listitem')[0]).getByLabelText('Done')).toBeInTheDocument()
  expect(screen.getByText('1 / 3 done')).toBeInTheDocument()
})

test('nav has Reading', async () => {
  mockApi(base())
  goTo('/')
  render(<App />)
  expect(await screen.findByRole('link', { name: 'Reading' })).toHaveAttribute('href', '/reading')
})

test('settings saves reading reviews per day', async () => {
  const calls = mockApi({
    'GET /api/overview': makeOverview(),
    'GET /api/health': { claude: { lastError: null }, vault: true },
    'POST /api/settings': { newPerDay: 3, englishFeedback: true, readingReviewsPerDay: 0 },
  })
  goTo('/settings')
  render(<App />)
  const input = await screen.findByRole('spinbutton', { name: 'Reading reviews per day' })
  await userEvent.clear(input)
  await userEvent.type(input, '0')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  await screen.findByText('Saved')
  expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ newPerDay: 3, englishFeedback: true, readingReviewsPerDay: 0 })
})
