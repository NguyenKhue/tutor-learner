import { expect, test } from 'vitest'
import type { ReadingCheck } from './types'
import { deriveReading, interviewCap } from './readingSchedule'

const check = (date: string, passed: boolean | undefined, state: ReadingCheck['state'] = 'graded'): ReadingCheck => ({
  id: date + String(passed), date, kind: 'first', quizHash: 'h', answers: {}, state, passed,
})

test('unread without graded checks', () => {
  expect(deriveReading([], '2026-10-24', null)).toEqual({ status: 'unread', rung: 0, nextCheck: null })
  expect(deriveReading([check('2026-10-24', undefined, 'pending')], '2026-10-24', null).status).toBe('unread')
})

test('pass gives 7 then 21 then done', () => {
  expect(deriveReading([check('2026-10-01', true)], '2026-10-24', null)).toEqual({ status: 'understood', rung: 1, nextCheck: '2026-10-08' })
  expect(deriveReading([check('2026-10-01', true), check('2026-10-08', true)], '2026-10-24', null)).toEqual({ status: 'understood', rung: 2, nextCheck: '2026-10-29' })
  expect(deriveReading([check('2026-10-01', true), check('2026-10-08', true), check('2026-10-29', true)], '2026-10-29', null)).toEqual({ status: 'done', rung: 3, nextCheck: null })
})

test('failure gives reread in 2 days and resets the rung', () => {
  expect(deriveReading([check('2026-10-01', true), check('2026-10-08', false)], '2026-10-24', null)).toEqual({ status: 'reread', rung: 0, nextCheck: '2026-10-10' })
  const after = deriveReading([check('2026-10-01', true), check('2026-10-08', true), check('2026-10-29', false), check('2026-10-31', true)], '2026-10-31', null)
  expect(after).toEqual({ status: 'understood', rung: 1, nextCheck: '2026-11-07' })
})

test('pending checks are ignored', () => {
  expect(deriveReading([check('2026-10-01', true), check('2026-10-08', undefined, 'pending')], '2026-10-24', null).rung).toBe(1)
})

test('caps at the interview and uses today when the cap passed', () => {
  expect(deriveReading([check('2026-12-30', true)], '2026-12-30', '2027-01-04').nextCheck).toBe('2027-01-04')
  expect(deriveReading([check('2027-01-05', true)], '2027-01-06', '2027-01-04').nextCheck).toBe('2027-01-06')
})

test('interviewCap subtracts the buffer', () => {
  expect(interviewCap({ interview_date: '2027-01-07', interview_buffer_days: 3, threshold: 0.8, daily_review_cap: 10 })).toBe('2027-01-04')
  expect(interviewCap({ interview_date: null, interview_buffer_days: 3, threshold: 0.8, daily_review_cap: 10 })).toBeNull()
})
