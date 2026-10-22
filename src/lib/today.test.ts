import { expect, test } from 'vitest'
import type { DuePoint, Point } from './types'
import { addExtra, buildToday, ensureToday, itemDone, nextNewPoints } from './today'
import { localToday } from './day'

const pt = (id: string, over: Partial<Point> = {}): Point => ({
  id, topic: id.split('/')[0], type: 'concept', interview: false, order: Number(id.split('/')[1].slice(0, 2)), sources: [],
  status: 'new', mastery: 0, box: null, next_review: null, history: [], ...over,
})
const due = (id: string): DuePoint => ({ point: id, topic: id.split('/')[0], type: 'concept', interview: true, overdue_days: 1 })

test('localToday uses Asia/Ho_Chi_Minh', () => {
  expect(localToday('Asia/Ho_Chi_Minh', new Date('2026-10-22T18:30:00Z'))).toBe('2026-10-23')
  expect(localToday('Asia/Ho_Chi_Minh', new Date('2026-10-22T16:30:00Z'))).toBe('2026-10-22')
})

test('review keeps tutor.py order and cap', () => {
  const list = buildToday({ date: '2026-10-22', due: [due('B/01 b'), due('A/01 a'), due('A/02 c')], points: [], topicOrder: [], cap: 2, newPerDay: 0 })
  expect(list.review).toEqual(['B/01 b', 'A/01 a'])
})

test('fresh follows topic_order then order', () => {
  const points = [pt('A/02 a2'), pt('B/01 b1'), pt('A/01 a1'), pt('C/01 c1')]
  expect(nextNewPoints(points, ['B', 'A'], 3, new Set())).toEqual(['B/01 b1', 'A/01 a1', 'A/02 a2'])
})

test('topics missing from topic_order go last by name', () => {
  const points = [pt('Z/01 z'), pt('M/01 m'), pt('A/01 a')]
  expect(nextNewPoints(points, ['A'], 3, new Set())).toEqual(['A/01 a', 'M/01 m', 'Z/01 z'])
})

test('interview first within the same order', () => {
  const points = [pt('A/01 x'), pt('A/01 y', { interview: true })]
  expect(nextNewPoints(points, ['A'], 2, new Set())).toEqual(['A/01 y', 'A/01 x'])
})

test('skips mastered, scheduled and excluded points', () => {
  const points = [
    pt('A/01 m', { status: 'mastered', next_review: '2026-11-01' }),
    pt('A/02 l', { status: 'learning' }),
    pt('A/03 s', { status: 'learning', next_review: '2026-10-30' }),
    pt('A/04 e'),
    pt('A/05 n'),
  ]
  expect(nextNewPoints(points, ['A'], 5, new Set(['A/04 e']))).toEqual(['A/02 l', 'A/05 n'])
})

test('fresh excludes points already in review', () => {
  const points = [pt('A/01 a', { status: 'learning' }), pt('A/02 b')]
  const list = buildToday({ date: 'd', due: [due('A/01 a')], points, topicOrder: ['A'], cap: 10, newPerDay: 3 })
  expect(list).toEqual({ date: 'd', review: ['A/01 a'], fresh: ['A/02 b'], extra: [] })
})

test('locked list survives a rebuild on the same day', () => {
  const prev = { date: '2026-10-22', review: ['x'], fresh: ['y'], extra: [] }
  expect(ensureToday(prev, () => ({ date: '2026-10-22', review: [], fresh: [], extra: [] }), '2026-10-22')).toBe(prev)
})

test('new day rebuilds', () => {
  const prev = { date: '2026-10-21', review: ['x'], fresh: ['y'], extra: [] }
  const next = { date: '2026-10-22', review: [], fresh: ['z'], extra: [] }
  expect(ensureToday(prev, () => next, '2026-10-22')).toBe(next)
  expect(ensureToday(null, () => next, '2026-10-22')).toBe(next)
})

test('addExtra prefers due points', () => {
  const list = { date: 'd', review: ['A/01 a'], fresh: ['A/02 b'], extra: [] }
  const points = [pt('A/01 a'), pt('A/02 b'), pt('A/03 c')]
  expect(addExtra(list, points, ['A'], [due('A/01 a'), due('B/09 z')]).extra).toEqual(['B/09 z'])
  expect(addExtra(list, points, ['A'], [due('A/01 a')]).extra).toEqual(['A/03 c'])
})

test('addExtra leaves the list unchanged when nothing is left', () => {
  const list = { date: 'd', review: [], fresh: ['A/01 a'], extra: [] }
  expect(addExtra(list, [pt('A/01 a')], ['A'], []).extra).toEqual([])
})

test('marks item done when history has an entry today', () => {
  const p = pt('A/01 a', { history: [{ d: '2026-10-22', kind: 'learn', ok: false, q: 'q2', why: '' }] })
  expect(itemDone(p, '2026-10-22')).toBe(true)
  expect(itemDone(p, '2026-10-23')).toBe(false)
})
