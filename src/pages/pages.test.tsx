import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { App } from '../app/App'
import { goTo, mockApi } from '../test/api'
import { makeOverview, makePoint } from '../test/fixtures'

afterEach(() => vi.unstubAllGlobals())

const P1 = 'Kotlin Language/01 Null safety'
const P2 = 'Kotlin Language/02 Data classes'
const P3 = 'Coroutines and Flow/01 Suspend'

function overview() {
  return makeOverview({
    topicOrder: ['Kotlin Language', 'Coroutines and Flow'],
    export: {
      ...makeOverview().export,
      points: [
        makePoint(P1, {
          status: 'learning', mastery: 0.5, interview: true, sources: ['[[Books/Kotlin/Null]]'],
          history: [{ d: '2026-10-21', kind: 'learn', ok: true, q: 'q2', why: 'covered both ideas' }],
        }),
        makePoint(P2),
        makePoint(P3, { status: 'mastered', mastery: 0.8, next_review: '2026-10-25', history: [{ d: '2026-10-22', kind: 'learn', ok: true, q: 'q2', why: 'ok' }] }),
      ],
    },
  })
}

test('topics page shows counts', async () => {
  mockApi({ 'GET /api/overview': overview() })
  goTo('/topics')
  render(<App />)
  const rows = await screen.findAllByRole('row')
  const kotlin = rows.find((r) => r.textContent?.includes('Kotlin Language'))!
  expect(within(kotlin).getByText('2')).toBeInTheDocument()
  expect(rows.findIndex((r) => r.textContent?.includes('Kotlin Language'))).toBeLessThan(rows.findIndex((r) => r.textContent?.includes('Coroutines and Flow')))
})

test('topic page lists its points with links', async () => {
  mockApi({ 'GET /api/overview': overview() })
  goTo(`/topics/${encodeURIComponent('Kotlin Language')}`)
  render(<App />)
  expect(await screen.findByRole('link', { name: 'Null safety' })).toHaveAttribute('href', `/point/${encodeURIComponent(P1)}`)
  expect(screen.getByRole('link', { name: 'Data classes' })).toBeInTheDocument()
  expect(screen.getByText('50%')).toBeInTheDocument()
})

test('point page shows history', async () => {
  mockApi({ 'GET /api/overview': overview(), 'GET /api/attempts': [] })
  goTo(`/point/${encodeURIComponent(P1)}`)
  render(<App />)
  expect(await screen.findByText('covered both ideas')).toBeInTheDocument()
  expect(screen.getByText('2026-10-21')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Study now' })).toHaveAttribute('href', `/study/${encodeURIComponent(P1)}?kind=learn`)
  expect(screen.getByRole('link', { name: 'Open lesson in Obsidian' })).toHaveAttribute(
    'href',
    'obsidian://open?vault=Khue%20Vault&file=Tutor%2FLessons%2FKotlin%20Language%2F01%20Null%20safety',
  )
  expect(screen.getByRole('link', { name: '[[Books/Kotlin/Null]]' })).toHaveAttribute('href', 'obsidian://open?vault=Khue%20Vault&file=Books%2FKotlin%2FNull')
})

test('progress page shows streak, mastered count and pace', async () => {
  mockApi({ 'GET /api/overview': overview() })
  goTo('/progress')
  render(<App />)
  expect(await screen.findByText('1 / 3 mastered')).toBeInTheDocument()
  expect(screen.getByText('2-day streak')).toBeInTheDocument()
  expect(screen.getByText(/About 1 new points? a day/)).toBeInTheDocument()
})

test('today shows the streak', async () => {
  mockApi({ 'GET /api/overview': overview() })
  goTo('/')
  render(<App />)
  expect(await screen.findByText('2-day streak')).toBeInTheDocument()
})

test('settings saves new per day', async () => {
  const calls = mockApi({
    'GET /api/overview': overview(),
    'GET /api/health': { claude: { lastError: { code: 'limit', message: 'usage limit' } }, vault: true },
    'POST /api/settings': { newPerDay: 5, englishFeedback: true },
  })
  goTo('/settings')
  render(<App />)
  const input = await screen.findByRole('spinbutton', { name: 'New points per day' })
  await userEvent.clear(input)
  await userEvent.type(input, '5')
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  expect(await screen.findByText('Saved')).toBeInTheDocument()
  expect(calls.find((c) => c.method === 'POST' && c.path === '/api/settings')!.body).toEqual({ newPerDay: 5, englishFeedback: true })
  expect(screen.getByText(/usage limit/)).toBeInTheDocument()
})

test('settings toggles english feedback', async () => {
  const calls = mockApi({
    'GET /api/overview': overview(),
    'GET /api/health': { claude: { lastError: null }, vault: true },
    'POST /api/settings': { newPerDay: 3, englishFeedback: false },
  })
  goTo('/settings')
  render(<App />)
  await userEvent.click(await screen.findByRole('checkbox', { name: 'English feedback' }))
  await userEvent.click(screen.getByRole('button', { name: 'Save' }))
  await screen.findByText('Saved')
  expect(calls.find((c) => c.method === 'POST')!.body).toEqual({ newPerDay: 3, englishFeedback: false })
  expect(screen.getByText(/Claude: OK/)).toBeInTheDocument()
})
