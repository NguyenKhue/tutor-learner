import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, test, vi } from 'vitest'
import { App } from '../app/App'
import { goTo, mockApi } from '../test/api'
import { makeOverview, makePoint } from '../test/fixtures'
import type { InterviewSession } from '../lib/types'

afterEach(() => {
  vi.unstubAllGlobals()
  try { localStorage.clear() } catch { /* no storage */ }
})

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

// ---- session, report, weak spots ----
const synth = () => {
  const s = { cancel: vi.fn(), speak: vi.fn(), getVoices: () => [] as unknown[] }
  vi.stubGlobal('speechSynthesis', s)
  vi.stubGlobal('SpeechSynthesisUtterance', class { text: string; constructor(t: string) { this.text = t } })
  return s
}

const plan = [
  { kind: 'technical' as const, persona: 'Sam', intro: 'Hi', competencies: [], questions: [
    { q: '0-0', prompt: 'What is a coroutine?', type: 'scenario' as const, source: {}, rubric: { mid: [], senior: [], lead: [] }, probes: [] },
    { q: '0-1', prompt: 'Explain Flow.', type: 'scenario' as const, source: {}, rubric: { mid: [], senior: [], lead: [] }, probes: [] },
  ] },
]
const turn = (from: 'interviewer' | 'candidate', q: string, text: string, over = {}) => ({ round: 0, q, from, text, at: '2026-11-04', ...over })
const scores = { reasoning: 4, depth: 3, structure: 4, english: 4, length: 3 }
const report = {
  levelMet: false, summary: 'Close, but shallow.',
  questions: [{ q: '0-0', scores, missed: ['Dispatchers'], sample: 'A coroutine is…', englishNotes: ['Use "a" before coroutine'] }],
  topFixes: [{ title: 'Go deeper', example: 'Name the dispatcher', action: 'Add one detail' }],
  nextSteps: { notes: ['Kotlin/Coroutines.md'], topics: ['Coroutines and Flow'], drills: [], gaps: [{ topic: 'Flow', url: 'https://example.com/flow' }], focus: 'Flow' },
  weakSpots: [],
}
const doneSession = (created = '2026-11-03T10:00:00Z', over: Partial<InterviewSession> = {}) => session('s1', created, 'Android dev', {
  state: 'done', plan, report,
  turns: [turn('interviewer', '0-0', 'What is a coroutine?'), turn('candidate', '0-0', 'A light thread', { voice: { audio: 'abc', seconds: 20 } })],
  practice: [], ...over,
})

test('a running interview reads the question aloud and sends the answer', async () => {
  const user = userEvent.setup()
  const s = synth()
  const running = session('s1', '2026-11-04T10:00:00Z', 'Android dev', {
    plan, current: { round: 0, q: '0-1', followups: 0 },
    turns: [turn('interviewer', '0-1', 'Good.\n\nExplain Flow.')],
  })
  const calls = mockApi({
    'GET /api/overview': overview(),
    'GET /api/interview': running,
    'POST /api/interview/answer': running,
  })
  goTo('/interview/s1')
  render(<App />)
  expect(await screen.findByText('Technical · question 2 of 2')).toBeInTheDocument()
  expect(screen.getByText('Good.')).toBeInTheDocument()
  expect(screen.getByText('Explain Flow.')).toBeInTheDocument()
  expect(s.speak).toHaveBeenCalledTimes(1)
  expect((s.speak.mock.calls[0][0] as { text: string }).text).toBe('Good.\n\nExplain Flow.')
  await user.click(screen.getByRole('button', { name: 'Play again' }))
  expect(s.speak).toHaveBeenCalledTimes(2)
  expect(screen.getByRole('button', { name: 'Send answer' })).toBeDisabled()
  await user.type(screen.getByLabelText('Your answer'), 'Flow is cold')
  await user.click(screen.getByRole('button', { name: 'Send answer' }))
  const post = calls.find((c) => c.path === '/api/interview/answer')
  expect(post?.body).toEqual({ id: 's1', text: 'Flow is cold' })
})

test('review lets you drop research items before starting', async () => {
  const user = userEvent.setup()
  const review = session('s1', '2026-11-04T10:00:00Z', 'x', {
    state: 'review',
    research: [
      { kind: 'company', text: 'Acme builds apps', url: 'https://acme.test', kept: true },
      { kind: 'process', text: 'Three rounds', url: 'https://acme.test/p', kept: true },
    ],
  })
  const calls = mockApi({ 'GET /api/overview': overview(), 'GET /api/interview': review, 'POST /api/interview/research': { ...review, state: 'planning' } })
  goTo('/interview/s1')
  render(<App />)
  await user.click(await screen.findByRole('checkbox', { name: /Three rounds/ }))
  await user.click(screen.getByRole('button', { name: 'Start interview' }))
  expect(calls.find((c) => c.path === '/api/interview/research')?.body).toEqual({ id: 's1', kept: [0] })
})

test('a failed step offers Try again', async () => {
  const user = userEvent.setup()
  const failed = session('s1', '2026-11-04T10:00:00Z', 'x', { state: 'planning', error: { code: 'failed', message: 'Could not plan' } })
  const calls = mockApi({ 'GET /api/overview': overview(), 'GET /api/interview': failed, 'POST /api/interview/retry': { ...failed, error: undefined } })
  goTo('/interview/s1')
  render(<App />)
  expect(await screen.findByText(/Could not plan/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  expect(calls.find((c) => c.path === '/api/interview/retry')?.body).toEqual({ id: 's1' })
})

test('the report shows scores, fixes and practice again', async () => {
  const user = userEvent.setup()
  const done = doneSession()
  const practiced = { ...done, practice: [{ q: '0-0', answer: 'Better', at: '2026-11-04', result: { ...report.questions[0], scores: { ...scores, depth: 4 } } }] }
  const calls = mockApi({ 'GET /api/overview': overview(), 'GET /api/interview': done, 'POST /api/interview/practice': practiced })
  goTo('/interview/s1')
  render(<App />)
  expect(await screen.findByText('Close, but shallow.')).toBeInTheDocument()
  expect(screen.getByText('Level not met yet')).toBeInTheDocument()
  expect(screen.getByText('Go deeper')).toBeInTheDocument()
  expect(screen.getByText('What is a coroutine?')).toBeInTheDocument()
  expect(screen.getByText('Dispatchers')).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Coroutines and Flow' })).toHaveAttribute('href', '/topics/Coroutines%20and%20Flow')
  const gap = screen.getByRole('link', { name: 'Flow' })
  expect(gap).toHaveAttribute('href', 'https://example.com/flow')
  expect(gap).toHaveAttribute('rel', expect.stringContaining('noreferrer'))
  await user.click(screen.getByRole('button', { name: 'Practice again' }))
  await user.type(screen.getByLabelText('Your answer'), 'Better')
  await user.click(screen.getByRole('button', { name: 'Send answer' }))
  expect(calls.find((c) => c.path === '/api/interview/practice')?.body).toEqual({ id: 's1', q: '0-0', text: 'Better' })
  expect(await screen.findByText('Your new answer')).toBeInTheDocument()
})

test('recordings older than 30 days show a note instead of a player', async () => {
  mockApi({ 'GET /api/overview': overview(), 'GET /api/interview': doneSession('2020-01-01T10:00:00Z') })
  goTo('/interview/s1')
  const { container } = render(<App />)
  expect(await screen.findByText('Recording removed after 30 days')).toBeInTheDocument()
  expect(container.querySelector('audio')).toBeNull()
})

test('weak spots show improving and still there', async () => {
  mockApi({
    'GET /api/overview': overview(),
    'GET /api/interview/weak-spots': [
      { key: 'a', kind: 'content', label: 'Cache invalidation', sessions: 2, lastSeen: '2026-11-03', trend: 'still' },
      { key: 'b', kind: 'english', label: 'Articles', sessions: 3, lastSeen: '2026-11-01', trend: 'improving' },
    ],
  })
  goTo('/interview/weak-spots')
  render(<App />)
  expect(await screen.findByText('Cache invalidation')).toBeInTheDocument()
  expect(screen.getByText('Still there')).toBeInTheDocument()
  expect(screen.getByText('Improving')).toBeInTheDocument()
  expect(screen.getByText(/seen in 3 interviews/)).toBeInTheDocument()
})

test('weak spots empty state', async () => {
  mockApi({ 'GET /api/overview': overview(), 'GET /api/interview/weak-spots': [] })
  goTo('/interview/weak-spots')
  render(<App />)
  expect(await screen.findByText('Do two interviews to see patterns.')).toBeInTheDocument()
})

test('practice shows pending, then the result when a later poll brings it', async () => {
  const pending = doneSession('2026-11-03T10:00:00Z', { practice: [{ q: '0-0', answer: 'Better', at: '2026-11-04' }] })
  const graded = { ...pending, practice: [{ ...pending.practice[0], result: { ...report.questions[0], missed: ['Polled result item'] } }] }
  let gets = 0
  mockApi({ 'GET /api/overview': overview(), 'GET /api/interview': () => (++gets < 2 ? pending : graded) })
  goTo('/interview/s1')
  render(<App />)
  expect(await screen.findByText('Grading your new answer')).toBeInTheDocument()
  expect(await screen.findByText('Polled result item', {}, { timeout: 4000 })).toBeInTheDocument()
  expect(screen.queryByText('Grading your new answer')).toBeNull()
}, 10000)

test('a practice that fails shows its error and Try again', async () => {
  const user = userEvent.setup()
  const pending = doneSession('2026-11-03T10:00:00Z', { practice: [{ q: '0-0', answer: 'Better', at: '2026-11-04' }] })
  const failed = { ...pending, practice: [{ ...pending.practice[0], error: { code: 'failed' as const, message: 'Grading broke' } }] }
  let gets = 0
  const calls = mockApi({
    'GET /api/overview': overview(),
    'GET /api/interview': () => (++gets < 2 ? pending : failed),
    'POST /api/interview/retry': pending,
  })
  goTo('/interview/s1')
  render(<App />)
  expect(await screen.findByText('Grading broke', {}, { timeout: 4000 })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Try again' }))
  expect(calls.find((c) => c.path === '/api/interview/retry')?.body).toEqual({ id: 's1' })
  expect(await screen.findByText('Grading your new answer')).toBeInTheDocument()
  expect(screen.queryByText('Grading broke')).toBeNull()
}, 10000)

test('only the latest errored practice entry offers Try again', async () => {
  const err = { code: 'failed' as const, message: 'Grading broke' }
  mockApi({ 'GET /api/overview': overview(), 'GET /api/interview': doneSession('2026-11-03T10:00:00Z', {
    practice: [{ q: '0-0', answer: 'one', at: '2026-11-04', error: err }, { q: '0-0', answer: 'two', at: '2026-11-04', error: err }],
  }) })
  goTo('/interview/s1')
  render(<App />)
  await screen.findAllByText('Grading broke')
  expect(screen.getAllByRole('button', { name: 'Try again' })).toHaveLength(1)
})

test('a 409 reloads the session and keeps the error visible', async () => {
  const user = userEvent.setup()
  const running = session('s1', '2026-11-04T10:00:00Z', 'x', {
    plan, current: { round: 0, q: '0-1', followups: 0 }, turns: [turn('interviewer', '0-1', 'Explain Flow.')],
  })
  const moved = { ...running, state: 'thinking' as const }
  let gets = 0
  mockApi({
    'GET /api/overview': overview(),
    'GET /api/interview': () => (++gets < 2 ? running : moved),
    'POST /api/interview/answer': { status: 409, body: { error: 'busy' } },
  })
  synth()
  goTo('/interview/s1')
  render(<App />)
  await user.type(await screen.findByLabelText('Your answer'), 'x')
  await user.click(screen.getByRole('button', { name: 'Send answer' }))
  expect(await screen.findByText('The interviewer is thinking')).toBeInTheDocument()
  expect(screen.getByText('busy')).toBeInTheDocument()
})

test('a failed practice send keeps the box and the text', async () => {
  const user = userEvent.setup()
  mockApi({ 'GET /api/overview': overview(), 'GET /api/interview': doneSession(), 'POST /api/interview/practice': { status: 409, body: { error: 'busy' } } })
  goTo('/interview/s1')
  render(<App />)
  await user.click(await screen.findByRole('button', { name: 'Practice again' }))
  await user.type(screen.getByLabelText('Your answer'), 'Keep me')
  await user.click(screen.getByRole('button', { name: 'Send answer' }))
  expect(await screen.findByText('busy')).toBeInTheDocument()
  expect(screen.getByLabelText('Your answer')).toHaveValue('Keep me')
})

const runningAnswered = () => session('s1', '2026-11-04T10:00:00Z', 'x', {
  plan, current: { round: 0, q: '0-1', followups: 0 },
  turns: [turn('interviewer', '0-0', 'Q1'), turn('candidate', '0-0', 'A1'), turn('interviewer', '0-1', 'Explain Flow.')],
})

test('End interview with an answer calls finish after confirming', async () => {
  const user = userEvent.setup()
  synth()
  const calls = mockApi({ 'GET /api/overview': overview(), 'GET /api/interview': runningAnswered(), 'POST /api/interview/finish': { ...runningAnswered(), state: 'reporting' } })
  goTo('/interview/s1')
  render(<App />)
  await user.click(await screen.findByRole('button', { name: 'End interview' }))
  await user.click(screen.getByRole('button', { name: 'End and get report' }))
  expect(calls.find((c) => c.path === '/api/interview/finish')?.body).toEqual({ id: 's1' })
})

test('End interview with nothing answered leaves to the list without finishing', async () => {
  const user = userEvent.setup()
  synth()
  const first = session('s1', '2026-11-04T10:00:00Z', 'x', { plan, current: { round: 0, q: '0-0', followups: 0 }, turns: [turn('interviewer', '0-0', 'Q1')] })
  const calls = mockApi({ 'GET /api/overview': overview(), 'GET /api/interview': first, 'GET /api/interviews': [] })
  goTo('/interview/s1')
  render(<App />)
  await user.click(await screen.findByRole('button', { name: 'End interview' }))
  await user.click(screen.getByRole('button', { name: 'Leave' }))
  expect(await screen.findByText('No mock interviews yet.')).toBeInTheDocument()
  expect(calls.some((c) => c.path === '/api/interview/finish')).toBe(false)
})

test('Finish calls finish when answers exist, else Leave interview shows', async () => {
  const user = userEvent.setup()
  synth()
  const done = { ...runningAnswered(), current: undefined }
  const calls = mockApi({ 'GET /api/overview': overview(), 'GET /api/interview': done, 'POST /api/interview/finish': { ...done, state: 'reporting' } })
  goTo('/interview/s1')
  render(<App />)
  await user.click(await screen.findByRole('button', { name: 'Finish' }))
  expect(calls.find((c) => c.path === '/api/interview/finish')?.body).toEqual({ id: 's1' })
})

test('with every question skipped, Leave interview replaces Finish', async () => {
  synth()
  const skipped = session('s1', '2026-11-04T10:00:00Z', 'x', {
    plan, turns: [turn('interviewer', '0-0', 'Q1'), turn('candidate', '0-0', '', { skipped: true })],
  })
  mockApi({ 'GET /api/overview': overview(), 'GET /api/interview': skipped })
  goTo('/interview/s1')
  render(<App />)
  expect(await screen.findByRole('button', { name: 'Leave interview' })).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Finish' })).toBeNull()
})

// ---- final review fixes ----
const KEY = 'tutor.interview.hideText'

test('review with a failed search still lets you start, and offers Search again', async () => {
  const user = userEvent.setup()
  const review = session('s1', '2026-11-04T10:00:00Z', 'x', {
    state: 'review', research: [], setup: { source: 'x', level: 'senior', rounds: ['hr'], topics: [], web: true, readAloud: true },
    error: { code: 'failed', message: 'No research found. You can start the interview without it.' },
  })
  const calls = mockApi({
    'GET /api/overview': overview(), 'GET /api/interview': review,
    'POST /api/interview/research': { ...review, state: 'planning', error: undefined },
  })
  goTo('/interview/s1')
  render(<App />)
  expect(await screen.findByText(/No research found/)).toBeInTheDocument()
  expect(screen.queryByText('Something went wrong')).toBeNull()
  await user.click(screen.getByRole('button', { name: 'Start interview' }))
  expect(calls.find((c) => c.path === '/api/interview/research')?.body).toEqual({ id: 's1', kept: [] })
})

test('review with a failed search: Search again retries the research', async () => {
  const user = userEvent.setup()
  const review = session('s1', '2026-11-04T10:00:00Z', 'x', {
    state: 'review', research: [], setup: { source: 'x', level: 'senior', rounds: ['hr'], topics: [], web: true, readAloud: true },
    error: { code: 'limit', message: 'Usage limit reached' },
  })
  const calls = mockApi({ 'GET /api/overview': overview(), 'GET /api/interview': review, 'POST /api/interview/retry': { ...review, state: 'researching', error: undefined } })
  goTo('/interview/s1')
  render(<App />)
  expect(await screen.findByText('Usage limit reached')).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Search again' }))
  expect(calls.find((c) => c.path === '/api/interview/retry')?.body).toEqual({ id: 's1' })
  expect(await screen.findByText('Searching the web')).toBeInTheDocument()
})

test('scores are out of 4', async () => {
  mockApi({ 'GET /api/overview': overview(), 'GET /api/interview': doneSession() })
  goTo('/interview/s1')
  const { container } = render(<App />)
  await screen.findByText('Close, but shallow.')
  expect(container.textContent).not.toContain('/5')
  expect(screen.getAllByText('4/4').length).toBeGreaterThan(0)
})

test('Hide text stays on across questions and is remembered', async () => {
  const user = userEvent.setup()
  synth()
  const first = session('s1', '2026-11-04T10:00:00Z', 'x', { plan, current: { round: 0, q: '0-0', followups: 0 }, turns: [turn('interviewer', '0-0', 'What is a coroutine?')] })
  const second = { ...first, current: { round: 0, q: '0-1', followups: 0 }, turns: [...first.turns, turn('candidate', '0-0', 'a'), turn('interviewer', '0-1', 'Explain Flow.')] }
  let gets = 0
  mockApi({
    'GET /api/overview': overview(),
    'GET /api/interview': () => (gets++ < 1 ? first : second),
    'POST /api/interview/answer': second,
  })
  goTo('/interview/s1')
  render(<App />)
  await user.click(await screen.findByRole('checkbox', { name: 'Hide text until I answer' }))
  expect(screen.queryByText('What is a coroutine?')).toBeNull()
  await user.type(screen.getByLabelText('Your answer'), 'a')
  await user.click(screen.getByRole('button', { name: 'Send answer' }))
  expect(await screen.findByText('Technical · question 2 of 2')).toBeInTheDocument()
  expect(screen.getByRole('checkbox', { name: 'Hide text until I answer' })).toBeChecked()
  expect(screen.queryByText('Explain Flow.')).toBeNull()
  expect(localStorage.getItem(KEY)).toBe('1')
})

test('Hide text starts from the remembered setting', async () => {
  synth()
  localStorage.setItem(KEY, '1')
  const first = session('s1', '2026-11-04T10:00:00Z', 'x', { plan, current: { round: 0, q: '0-0', followups: 0 }, turns: [turn('interviewer', '0-0', 'What is a coroutine?')] })
  mockApi({ 'GET /api/overview': overview(), 'GET /api/interview': first })
  goTo('/interview/s1')
  render(<App />)
  expect(await screen.findByRole('checkbox', { name: 'Hide text until I answer' })).toBeChecked()
  expect(screen.queryByText('What is a coroutine?')).toBeNull()
})

test('without speech synthesis there is no Play again and no Hide text', async () => {
  vi.stubGlobal('speechSynthesis', undefined)
  const first = session('s1', '2026-11-04T10:00:00Z', 'x', { plan, current: { round: 0, q: '0-0', followups: 0 }, turns: [turn('interviewer', '0-0', 'What is a coroutine?')] })
  mockApi({ 'GET /api/overview': overview(), 'GET /api/interview': first })
  goTo('/interview/s1')
  render(<App />)
  expect(await screen.findByText('What is a coroutine?')).toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Play again' })).toBeNull()
  expect(screen.queryByRole('checkbox', { name: 'Hide text until I answer' })).toBeNull()
})

test('an ended interview with no closing line shows a short closing line, not the old question', async () => {
  synth()
  const ended = session('s1', '2026-11-04T10:00:00Z', 'x', {
    plan, turns: [turn('interviewer', '0-1', 'Explain Flow.'), turn('candidate', '0-1', '', { skipped: true }), turn('candidate', '0-0', 'a')],
  })
  mockApi({ 'GET /api/overview': overview(), 'GET /api/interview': ended })
  goTo('/interview/s1')
  render(<App />)
  expect(await screen.findByText("That's the end of the interview.")).toBeInTheDocument()
  expect(screen.queryByText('Explain Flow.')).toBeNull()
  expect(screen.getByRole('button', { name: 'Finish' })).toBeInTheDocument()
})

test('an ended interview with a closing line shows that line', async () => {
  synth()
  const ended = session('s1', '2026-11-04T10:00:00Z', 'x', {
    plan, turns: [turn('candidate', '0-1', 'a'), turn('interviewer', '0-1', 'Thank you, goodbye.')],
  })
  mockApi({ 'GET /api/overview': overview(), 'GET /api/interview': ended })
  goTo('/interview/s1')
  render(<App />)
  expect(await screen.findByText('Thank you, goodbye.')).toBeInTheDocument()
  expect(screen.queryByText("That's the end of the interview.")).toBeNull()
})

test('the list marks sessions that are not done as In progress', async () => {
  mockApi({
    'GET /api/overview': overview(),
    'GET /api/interviews': [
      session('b', '2026-11-03', 'Running one'),
      session('a', '2026-11-01', 'Done one', { state: 'done' }),
    ],
  })
  goTo('/interview')
  render(<App />)
  await screen.findByText('Running one')
  const rows = screen.getAllByRole('listitem')
  expect(within(rows[0]).getByText('In progress')).toBeInTheDocument()
  expect(within(rows[1]).queryByText('In progress')).toBeNull()
})

test('setup: a topic picked by hand survives a later blur', async () => {
  const user = userEvent.setup()
  mockApi({ 'GET /api/overview': overview(), 'GET /api/interviews': [] })
  goTo('/interview/new')
  render(<App />)
  const box = await screen.findByLabelText('Job description or notes')
  await user.type(box, 'Kotlin dev')
  await user.tab()
  expect(screen.getByRole('button', { name: 'Kotlin Language' })).toHaveAttribute('aria-pressed', 'true')
  await user.click(screen.getByRole('button', { name: 'Kotlin Language' })) // turn it off by hand
  await user.type(box, ' and more')
  await user.tab()
  expect(screen.getByRole('button', { name: 'Kotlin Language' })).toHaveAttribute('aria-pressed', 'false')
})

test('setup: "programming language" does not pick Kotlin Language', async () => {
  const user = userEvent.setup()
  mockApi({ 'GET /api/overview': overview(), 'GET /api/interviews': [] })
  goTo('/interview/new')
  render(<App />)
  await user.type(await screen.findByLabelText('Job description or notes'), 'any programming language')
  await user.tab()
  expect(screen.getByRole('button', { name: 'Kotlin Language' })).toHaveAttribute('aria-pressed', 'false')
})
