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
  expect(await screen.findByText('77 days to interview')).toBeInTheDocument()
  expect(screen.getByText('1 / 3 done')).toBeInTheDocument()
})

test('lists review before new', async () => {
  mockApi({ 'GET /api/overview': overview() })
  goTo('/')
  render(<App />)
  const review = await screen.findByRole('region', { name: 'Review' })
  const fresh = screen.getByRole('region', { name: 'New' })
  expect(within(review).getByText('How suspend works')).toBeInTheDocument()
  expect(within(fresh).getAllByRole('link').map((a) => a.textContent)).toEqual(['Null safety', 'Any, Unit and Nothing'])
  expect(review.compareDocumentPosition(fresh) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  expect(within(review).getByRole('link', { name: 'How suspend works' })).toHaveAttribute(
    'href',
    `/study/${encodeURIComponent(A)}?kind=review`,
  )
  expect(within(fresh).getByRole('link', { name: 'Null safety' })).toHaveAttribute('href', `/study/${encodeURIComponent(B)}?kind=learn`)
})

test('done items show a check', async () => {
  mockApi({ 'GET /api/overview': overview() })
  goTo('/')
  render(<App />)
  const fresh = await screen.findByRole('region', { name: 'New' })
  const items = within(fresh).getAllByRole('listitem')
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
  const extra = await screen.findByRole('region', { name: 'Extra' })
  expect(within(extra).getByText('Data classes')).toBeInTheDocument()
  expect(calls.some((c) => c.method === 'POST' && c.path === '/api/today/extra')).toBe(true)
})

test('empty list says nothing left', async () => {
  mockApi({ 'GET /api/overview': makeOverview() })
  goTo('/')
  render(<App />)
  expect(await screen.findByText('Nothing left today.')).toBeInTheDocument()
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
