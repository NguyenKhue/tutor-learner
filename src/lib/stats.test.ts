import { expect, test } from 'vitest'
import { makePoint } from '../test/fixtures'
import { activityByDay, dueForecast, pace, streak, topicSummary } from './stats'

const h = (d: string) => ({ d, kind: 'learn' as const, ok: true, q: 'q1', why: '' })

test('activityByDay counts history entries per day', () => {
  const pts = [makePoint('A/01 a', { history: [h('2026-10-20'), h('2026-10-21')] }), makePoint('A/02 b', { history: [h('2026-10-21')] })]
  expect(Object.fromEntries(activityByDay(pts))).toEqual({ '2026-10-20': 1, '2026-10-21': 2 })
})

test('streak counts back from today', () => {
  const pts = [makePoint('A/01 a', { history: [h('2026-10-18'), h('2026-10-20'), h('2026-10-21'), h('2026-10-22')] })]
  expect(streak(pts, '2026-10-22')).toBe(3)
})

test('streak allows today to be empty', () => {
  const pts = [makePoint('A/01 a', { history: [h('2026-10-20'), h('2026-10-21')] })]
  expect(streak(pts, '2026-10-22')).toBe(2)
  expect(streak(pts, '2026-10-23')).toBe(0)
  expect(streak([], '2026-10-22')).toBe(0)
})

test('streak crosses month ends', () => {
  const pts = [makePoint('A/01 a', { history: [h('2026-10-31'), h('2026-11-01')] })]
  expect(streak(pts, '2026-11-01')).toBe(2)
})

test('forecast puts overdue on today', () => {
  const pts = [
    makePoint('A/01 a', { next_review: '2026-10-10' }),
    makePoint('A/02 b', { next_review: '2026-10-22' }),
    makePoint('A/03 c', { next_review: '2026-10-24' }),
    makePoint('A/04 d', { next_review: '2026-12-01' }),
    makePoint('A/05 e'),
  ]
  const f = dueForecast(pts, '2026-10-22', 3)
  expect(f).toEqual([
    { date: '2026-10-22', count: 2 },
    { date: '2026-10-23', count: 0 },
    { date: '2026-10-24', count: 1 },
  ])
  expect(dueForecast(pts, '2026-10-22')).toHaveLength(14)
})

test('pace with 238 remaining and 77 days left gives 5 per day', () => {
  const pts = [makePoint('A/00 m', { status: 'mastered' }), ...Array.from({ length: 238 }, (_, i) => makePoint(`A/${String(i + 1).padStart(3, '0')} p`))]
  expect(pace(pts, '2026-10-22', '2027-01-07')).toEqual({ remaining: 238, daysLeft: 49, perDay: 5 })
})

test('pace without interview date', () => {
  expect(pace([makePoint('A/01 a')], '2026-10-22', null)).toEqual({ remaining: 1, daysLeft: 0, perDay: null })
})

test('pace never divides by less than one day', () => {
  expect(pace([makePoint('A/01 a'), makePoint('A/02 b')], '2027-01-01', '2027-01-07').daysLeft).toBe(1)
})

test('topicSummary follows topic order', () => {
  const pts = [
    makePoint('B/01 b', { status: 'mastered', interview: true }),
    makePoint('A/01 a', { status: 'learning', interview: true }),
    makePoint('A/02 c'),
    makePoint('C/01 z'),
  ]
  expect(topicSummary(pts, ['B', 'A'])).toEqual([
    { topic: 'B', total: 1, new: 0, learning: 0, mastered: 1, interviewPending: 0 },
    { topic: 'A', total: 2, new: 1, learning: 1, mastered: 0, interviewPending: 1 },
    { topic: 'C', total: 1, new: 1, learning: 0, mastered: 0, interviewPending: 0 },
  ])
})
