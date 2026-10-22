import { afterEach, expect, test } from 'vitest'
import { nextNewPoints } from '../src/lib/today'
import { readTopicOrder } from './roadmap'
import { makeTestVault } from './testVault'
import { createTutorCli } from './tutor'

let cleanup: (() => void) | undefined
afterEach(() => cleanup?.())

test('first fresh point matches tutor.py next', async () => {
  const v = makeTestVault(
    [
      { topic: 'Alpha', name: '01 a', type: 'memory', order: 1 },
      { topic: 'Beta', name: '02 b', type: 'memory', order: 2 },
      { topic: 'Beta', name: '01 x', type: 'memory', order: 1 },
      { topic: 'Beta', name: '01 y', type: 'concept', order: 1, interview: true },
      { topic: 'Gamma', name: '01 g', type: 'memory', order: 1 },
    ],
    { topicOrder: ['Beta', 'Alpha'] },
  )
  cleanup = v.cleanup
  const tutor = createTutorCli({ vault: v.vault })
  const data = await tutor.exportData('2026-10-22')
  const ours = nextNewPoints(data.points, readTopicOrder(v.vault), 5, new Set())
  expect(ours[0]).toBe((await tutor.next('2026-10-22')).point)
  expect(ours).toEqual(['Beta/01 y', 'Beta/01 x', 'Beta/02 b', 'Alpha/01 a', 'Gamma/01 g'])
})
