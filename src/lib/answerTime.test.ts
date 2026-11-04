import { expect, test } from 'vitest'
import { recordLimit, ROUND_TARGET, targetFor, validTarget, zoneOf } from './answerTime'

test('each round has its own green zone', () => {
  expect(targetFor('hr')).toEqual([45, 90])
  expect(targetFor('system_design')).toEqual([120, 240])
  expect(targetFor(undefined)).toEqual(ROUND_TARGET.technical)
})

test("a question's own target wins when it is sane", () => {
  expect(targetFor('hr', { seconds: [30, 60] })).toEqual([30, 60])
  expect(targetFor('hr', { seconds: [60, 70] })).toEqual([45, 90])
  expect(validTarget([10, 60])).toBeUndefined()
  expect(validTarget([60, 400])).toBeUndefined()
  expect(validTarget([30.5, 60])).toBeUndefined()
  expect(validTarget('30-60')).toBeUndefined()
})

test('recording runs half as long again as the zone, at least two minutes', () => {
  expect(recordLimit([45, 90])).toBe(150)
  expect(recordLimit([30, 60])).toBe(120)
  expect(recordLimit([120, 240])).toBe(360)
})

test('a length is short, good or long against the zone', () => {
  expect(zoneOf(44, [45, 90])).toBe('short')
  expect(zoneOf(90, [45, 90])).toBe('good')
  expect(zoneOf(91, [45, 90])).toBe('long')
})
