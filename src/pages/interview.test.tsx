import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { App } from '../app/App'
import { goTo, mockApi } from '../test/api'
import { makeOverview, makePoint } from '../test/fixtures'
import type { InterviewSession } from '../lib/types'

afterEach(() => vi.unstubAllGlobals())

const overview = () => makeOverview({
  topicOrder: ['Kotlin Language', 'Coroutines and Flow'],
  export: {
    ...makeOverview().export,
    points: [makePoint('Kotlin Language/01 A'), makePoint('Coroutines and Flow/01 B', { status: 'learning' })],
  },
})

function session(id: string, created: string, source: string, over: Partial<InterviewSession> = {}): InterviewSession {
  return {
    id, created, state: 'running', turns: [], practice: [],
    setup: { source, level: 'senior', rounds: ['hr', 'technical'], topics: [], web: false, readAloud: true }, ...over,
  }
}

test('the list shows past interviews newest first and links to a new one', async () => {
  mockApi({
    'GET /api/overview': overview(),
    'GET /api/interviews': [
      session('b', '2026-11-03T10:00:00Z', 'Android engineer at Acme\nMore text'),
      session('a', '2026-11-01T10:00:00Z', '', {
        state: 'done',
        report: { levelMet: true, summary: '', questions: [], topFixes: [], nextSteps: { notes: [], topics: [], drills: [], gaps: [], focus: '' }, weakSpots: [] },
      }),
    ],
  })
  goTo('/interview')
  render(<App />)
  expect(await screen.findByText('Android engineer at Acme')).toBeInTheDocument()
  const rows = screen.getAllByRole('listitem')
  expect(rows).toHaveLength(2)
  expect(within(rows[0]).getByRole('link')).toHaveAttribute('href', '/interview/b')
  expect(within(rows[1]).getByText('No job description')).toBeInTheDocument()
  expect(within(rows[1]).getByText('Level met')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'New mock interview' })).toHaveAttribute('href', '/interview/new')
  expect(screen.getByRole('link', { name: 'Weak spots' })).toHaveAttribute('href', '/interview/weak-spots')
})

test('setup sends the chosen level, rounds, topics and toggles', async () => {
  const user = userEvent.setup()
  const calls = mockApi({
    'GET /api/overview': overview(),
    'POST /api/interview': session('new1', '2026-11-04T10:00:00Z', 'x'),
    'GET /api/interviews': [],
  })
  goTo('/interview/new')
  render(<App />)
  const box = await screen.findByLabelText('Job description or notes')
  // empty on load: started-topics fallback
  expect(screen.getByRole('button', { name: 'Coroutines and Flow' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: 'Kotlin Language' })).toHaveAttribute('aria-pressed', 'false')
  await user.type(box, 'Kotlin dev')
  await user.tab() // blur
  expect(screen.getByRole('button', { name: 'Kotlin Language' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getByRole('button', { name: 'Coroutines and Flow' })).toHaveAttribute('aria-pressed', 'false')
  await user.click(screen.getByRole('button', { name: 'Coroutines and Flow' }))
  await user.click(screen.getByRole('button', { name: 'Lead' }))
  await user.click(screen.getByRole('checkbox', { name: 'Behavioral / Lead' }))
  await user.click(screen.getByRole('checkbox', { name: 'Search the web' }))
  await user.click(screen.getByRole('checkbox', { name: 'Read questions aloud' }))
  await user.click(screen.getByRole('button', { name: 'Prepare interview' }))
  const post = calls.find((c) => c.method === 'POST')
  expect(post?.path).toBe('/api/interview')
  expect(post?.body).toEqual({
    source: 'Kotlin dev', level: 'lead', rounds: ['hr', 'technical', 'system_design'],
    topics: ['Kotlin Language', 'Coroutines and Flow'], web: true, readAloud: false,
  })
})

test('nav has Interview', async () => {
  mockApi({ 'GET /api/overview': overview(), 'GET /api/interviews': [] })
  goTo('/interview')
  render(<App />)
  expect(await screen.findByRole('link', { name: 'Interview' })).toHaveAttribute('href', '/interview')
})
