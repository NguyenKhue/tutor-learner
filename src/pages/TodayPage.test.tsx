import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { App } from '../app/App'
import { goTo, mockApi } from '../test/api'
import { makeOverview, makePoint } from '../test/fixtures'

afterEach(() => vi.unstubAllGlobals())

const A = 'Coroutines and Flow/01 How suspend works'
const B = 'Kotlin Language/01 Null safety'
const C = 'Kotlin Language/02 Any, Unit and Nothing'
const D = 'Kotlin Language/03 Data classes'

function overview() {
  return makeOverview({
    export: {
      ...makeOverview().export,
      points: [
        makePoint(A, { status: 'mastered', interview: true, next_review: '2026-10-10' }),
        makePoint(B, { history: [{ d: '2026-10-22', kind: 'learn', ok: true, q: 'q2', why: 'x' }], status: 'learning' }),
        makePoint(C, { type: 'memory' }),
        makePoint(D),
      ],
    },
    list: { date: '2026-10-22', review: [A], fresh: [B, C], extra: [] },
  })
}

test('shows countdown and done count', async () => {
  mockApi({ 'GET /api/overview': overview() })
  goTo('/')
  render(<App />)
  expect((await screen.findByText('77')).parentElement).toHaveTextContent('77 days to interview')
  expect(screen.getByText('1 of 3 done today')).toBeInTheDocument()
})

test('the next thing to do has one Start button', async () => {
  mockApi({ 'GET /api/overview': overview() })
  goTo('/')
  render(<App />)
  const next = await screen.findByRole('region', { name: 'How suspend works' })
  expect(within(next).getByText('Next, a review')).toBeInTheDocument()
  expect(within(next).getByRole('link', { name: 'Start' })).toHaveAttribute('href', `/study/${encodeURIComponent(A)}?kind=review`)
})

test('the rest of the list keeps its order and links', async () => {
  mockApi({ 'GET /api/overview': overview() })
  goTo('/')
  render(<App />)
  const list = await screen.findByRole('list', { name: "Today's list" })
  expect(within(list).getAllByRole('link').map((a) => a.textContent)).toEqual(['Null safety', 'Any, Unit and Nothing'])
  expect(within(list).getByRole('link', { name: 'Null safety' })).toHaveAttribute('href', `/study/${encodeURIComponent(B)}?kind=learn`)
})

test('done items show a check and are skipped by Start', async () => {
  mockApi({ 'GET /api/overview': overview() })
  goTo('/')
  render(<App />)
  const list = await screen.findByRole('list', { name: "Today's list" })
  const items = within(list).getAllByRole('listitem')
  expect(within(items[0]).getByLabelText('Done')).toBeInTheDocument()
  expect(within(items[1]).queryByLabelText('Done')).toBeNull()
})

test('study one more appends an item', async () => {
  const calls = mockApi({
    'GET /api/overview': overview(),
    'POST /api/today/extra': { date: '2026-10-22', review: [A], fresh: [B, C], extra: [D] },
  })
  goTo('/')
  render(<App />)
  await userEvent.click(await screen.findByRole('button', { name: 'Study one more' }))
  expect(await screen.findByText('Data classes')).toBeInTheDocument()
  expect(screen.getByText('Extra')).toBeInTheDocument()
  expect(calls.some((c) => c.method === 'POST' && c.path === '/api/today/extra')).toBe(true)
})

test('empty list says nothing left', async () => {
  mockApi({ 'GET /api/overview': makeOverview() })
  goTo('/')
  render(<App />)
  expect(await screen.findByText('Nothing left today.')).toBeInTheDocument()
})

test('a finished day says so', async () => {
  mockApi({ 'GET /api/overview': makeOverview({ export: { ...makeOverview().export, points: [makePoint(B, { history: [{ d: '2026-10-22', kind: 'learn', ok: true, q: 'q2', why: 'x' }] })] }, list: { date: '2026-10-22', review: [], fresh: [B], extra: [] } }) })
  goTo('/')
  render(<App />)
  expect(await screen.findByText('All done for today')).toBeInTheDocument()
  expect(screen.getByText(/You finished all 1\./)).toBeInTheDocument()
})

test('a day with no streak invites one', async () => {
  mockApi({ 'GET /api/overview': makeOverview() })
  goTo('/')
  render(<App />)
  expect(await screen.findByText('Start a streak today')).toBeInTheDocument()
})

test('shows a load error', async () => {
  mockApi({ 'GET /api/overview': { status: 502, body: { error: 'tutor.py failed' } } })
  goTo('/')
  render(<App />)
  expect(await screen.findByText(/tutor.py failed/)).toBeInTheDocument()
})

test('nav has the main pages', async () => {
  mockApi({ 'GET /api/overview': overview() })
  goTo('/')
  render(<App />)
  for (const name of ['Today', 'Topics', 'Progress', 'Settings']) expect(await screen.findByRole('link', { name })).toBeInTheDocument()
})
