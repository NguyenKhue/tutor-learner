import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import type { InterviewSession } from '../../src/lib/types'
import { createInterviewStore } from './store'

let dir: string
let file: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tutor-interviews-'))
  file = path.join(dir, 'interviews.json')
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

test('starts with no sessions', async () => {
  expect(await createInterviewStore(file).read()).toEqual({ version: 1, sessions: [] })
})

test('persists a session across stores', async () => {
  const session: InterviewSession = {
    id: 'a1', created: '2026-11-04T00:00:00Z', state: 'researching', turns: [], practice: [],
    setup: { source: 'Acme', level: 'senior', rounds: ['technical'], topics: [], web: false, readAloud: false },
  }
  await createInterviewStore(file).update((f) => {
    f.sessions.push(session)
  })
  expect((await createInterviewStore(file).read()).sessions).toEqual([session])
})
