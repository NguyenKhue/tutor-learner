import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { createStateStore, emptyState } from './state'

let dir: string
let file: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tutor-state-'))
  file = path.join(dir, 'state.json')
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

test('starts empty when no file', async () => {
  expect(await createStateStore(file).read()).toEqual(emptyState())
  expect(emptyState().settings).toEqual({ newPerDay: 3, englishFeedback: true })
})

test('persists updates across stores', async () => {
  await createStateStore(file).update((s) => {
    s.settings.newPerDay = 5
  })
  expect((await createStateStore(file).read()).settings.newPerDay).toBe(5)
  expect(fs.readdirSync(dir)).toEqual(['state.json'])
})

test('update returns the callback result', async () => {
  expect(await createStateStore(file).update(() => 42)).toBe(42)
})

test('a throwing update changes nothing', async () => {
  const store = createStateStore(file)
  await expect(
    store.update((s) => {
      s.settings.newPerDay = 9
      throw new Error('boom')
    }),
  ).rejects.toThrow('boom')
  expect((await store.read()).settings.newPerDay).toBe(3)
})

test('moves a corrupt file aside', async () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  fs.writeFileSync(file, '{broken')
  expect(await createStateStore(file).read()).toEqual(emptyState())
  expect(fs.readdirSync(dir).some((n) => n.startsWith('state.json.corrupt-'))).toBe(true)
})

test('runs updates one at a time', async () => {
  const store = createStateStore(file)
  await Promise.all(
    Array.from({ length: 10 }, (_, i) =>
      store.update(async (s) => {
        await new Promise((r) => setTimeout(r, 1))
        s.attempts.push({ id: String(i) } as never)
      }),
    ),
  )
  expect((await createStateStore(file).read()).attempts.length).toBe(10)
})
