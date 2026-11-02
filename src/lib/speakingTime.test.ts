import { expect, test } from 'vitest'
import { clock, lengthNote, timeHint } from './speakingTime'

test('clock pads the seconds', () => {
  expect(clock(0)).toBe('0:00')
  expect(clock(9.9)).toBe('0:09')
  expect(clock(72)).toBe('1:12')
})

test('the hint follows the green zone', () => {
  expect(timeHint(24.4)).toBe('Keep going, 6s to the green zone')
  expect(timeHint(30)).toBe('Good length')
  expect(timeHint(60.9)).toBe('Good length')
  expect(timeHint(61)).toBe('Time to wrap up')
})

test('the length note names short, good and long answers', () => {
  expect(lengthNote(12)).toBe('a bit short')
  expect(lengthNote(45)).toBe('good length')
  expect(lengthNote(90)).toBe('a bit long')
})
