import { afterEach, expect, test } from 'vitest'
import { makeTestVault } from './testVault'
import { createTutorCli, TutorCliError } from './tutor'

let cleanup: (() => void) | undefined
afterEach(() => cleanup?.())

function setup() {
  const v = makeTestVault([
    { topic: 'Kotlin', name: '01 Null safety', type: 'memory', order: 1, interview: true },
    { topic: 'Kotlin', name: '02 Data classes', type: 'concept', order: 2 },
  ])
  cleanup = v.cleanup
  return createTutorCli({ vault: v.vault })
}

test('exportData returns all points', async () => {
  const data = await setup().exportData('2026-10-22')
  expect(data.points.length).toBe(2)
  expect(data.points[0].status).toBe('new')
  expect(data.points[0].id).toBe('Kotlin/01 Null safety')
})

test('record appends history and returns derived fields', async () => {
  const tutor = setup()
  const r = await tutor.record({ point: 'Kotlin/01 Null safety', ok: true, kind: 'learn', q: 'q1', why: 'x', date: '2026-10-22' })
  expect(r.status).toBe('learning')
  expect(r.mastery).toBe(0.5)
  const data = await tutor.exportData('2026-10-22')
  expect(data.points.find((p) => p.id === 'Kotlin/01 Null safety')!.history.length).toBe(1)
})

test('record rejects unknown point', async () => {
  const tutor = setup()
  const err = await tutor.record({ point: 'Nope/x', ok: true, kind: 'learn', q: 'q1', why: '', date: '2026-10-22' }).catch((e) => e)
  expect(err).toBeInstanceOf(TutorCliError)
  expect(err.message).toContain('Nope/x')
})

test('serializes record calls', async () => {
  const tutor = setup()
  const calls = Array.from({ length: 5 }, (_, i) =>
    tutor.record({ point: 'Kotlin/01 Null safety', ok: true, kind: 'learn', q: `q${i + 1}`, why: 'x', date: '2026-10-22' }),
  )
  const results = await Promise.allSettled(calls)
  expect(results.every((r) => r.status === 'fulfilled')).toBe(true)
  const data = await tutor.exportData('2026-10-22')
  expect(data.points.find((p) => p.id === 'Kotlin/01 Null safety')!.history.length).toBe(5)
})

test('due and next return script output', async () => {
  const tutor = setup()
  expect(await tutor.due('2026-10-22')).toEqual([])
  const n = await tutor.next('2026-10-22')
  expect(n.mode).toBe('learn')
  expect(n.point).toBe('Kotlin/01 Null safety')
})
