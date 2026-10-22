import { afterEach, expect, test } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { readTopicOrder } from './roadmap'
import { makeTestVault } from './testVault'

let cleanup: (() => void) | undefined
afterEach(() => cleanup?.())

test('readTopicOrder parses the roadmap line', () => {
  const v = makeTestVault([{ topic: 'A', name: '01 x', type: 'memory', order: 1 }], { topicOrder: ['B topic', 'A'] })
  cleanup = v.cleanup
  expect(readTopicOrder(v.vault)).toEqual(['B topic', 'A'])
})

test('readTopicOrder returns [] without a roadmap', () => {
  const v = makeTestVault([])
  cleanup = v.cleanup
  fs.rmSync(path.join(v.vault, 'Tutor/Roadmap.md'))
  expect(readTopicOrder(v.vault)).toEqual([])
})
