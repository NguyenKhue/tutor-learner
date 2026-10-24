import { expect, test } from 'vitest'
import type { ReadingItem } from './types'
import { dueReading, upNext } from './readingOrder'

const item = (path: string, over: Partial<ReadingItem> = {}): ReadingItem => ({
  path, title: path, chars: 1000, mtime: 0, hash: 'h', topic: 'A', priority: 'medium', minutes: 5, why: '', classifiedHash: 'h',
  isSource: false, present: true, status: 'unread', skipped: false, nextCheck: null, rung: 0, openCheck: null, ...over,
})

test('today topics first, then studied, then the rest', () => {
  const items = [item('a', { topic: 'A' }), item('b', { topic: 'B' }), item('c', { topic: 'C' }), item('d', { topic: 'D' })]
  expect(upNext(items, ['C'], ['B'], ['A', 'B', 'C', 'D'], 4)).toEqual(['c', 'b', 'a', 'd'])
})

test('priority, non-source, shorter, path inside a group', () => {
  const items = [
    item('z-low', { priority: 'low' }),
    item('y-src', { priority: 'high', isSource: true }),
    item('x-long', { priority: 'high', chars: 9000 }),
    item('w-short', { priority: 'high', chars: 500 }),
    item('v-short', { priority: 'high', chars: 500 }),
  ]
  expect(upNext(items, ['A'], [], ['A'], 5)).toEqual(['v-short', 'w-short', 'x-long', 'y-src', 'z-low'])
})

test('skips read, skipped, missing, unclassified and skip-priority notes', () => {
  const items = [
    item('ok'),
    item('read', { status: 'understood' }),
    item('skipped', { skipped: true }),
    item('gone', { present: false }),
    item('none', { topic: null }),
    item('unclassified', { topic: undefined }),
    item('skip', { priority: 'skip' }),
  ]
  expect(upNext(items, [], [], ['A'])).toEqual(['ok'])
})

test('up next defaults to three', () => {
  expect(upNext(['a', 'b', 'c', 'd'].map((p) => item(p)), [], [], ['A'])).toHaveLength(3)
})

test('due orders most overdue first', () => {
  const items = [
    item('later', { status: 'understood', nextCheck: '2026-10-23' }),
    item('first', { status: 'reread', nextCheck: '2026-10-20' }),
    item('same-high', { status: 'understood', nextCheck: '2026-10-23', priority: 'high' }),
    item('future', { status: 'understood', nextCheck: '2026-10-30' }),
    item('gone', { status: 'understood', nextCheck: '2026-10-01', present: false }),
  ]
  expect(dueReading(items, '2026-10-24')).toEqual(['first', 'same-high', 'later'])
})
