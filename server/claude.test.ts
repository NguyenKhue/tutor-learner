import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, expect, test } from 'vitest'
import { ClaudeError, runClaude } from './claude'

const BIN = path.join(__dirname, 'fakeClaude.mjs')
const SCHEMA = { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] }
let dir: string
let waits: number[]
const sleep = async (ms: number) => {
  waits.push(ms)
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-claude-'))
  waits = []
  process.env.FAKE_CLAUDE_LOG = path.join(dir, 'log.jsonl')
  process.env.FAKE_CLAUDE_COUNTER = path.join(dir, 'counter')
  delete process.env.FAKE_CLAUDE_MODE
  delete process.env.FAKE_CLAUDE_OUTPUT
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

const runs = () => fs.readFileSync(process.env.FAKE_CLAUDE_LOG!, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
const call = (extra: Partial<Parameters<typeof runClaude>[0]> = {}) =>
  runClaude<{ ok: boolean }>({ prompt: 'Grade this', schema: SCHEMA, bin: BIN, cwd: dir, sleep, ...extra })

test('passes the exact args and the prompt on stdin', async () => {
  await call()
  const [run] = runs()
  expect(run.argv).toEqual([
    '-p', '--model', 'sonnet', '--tools', '', '--setting-sources', '', '--no-session-persistence',
    '--output-format', 'json', '--json-schema', JSON.stringify(SCHEMA),
  ])
  expect(run.argv).not.toContain('--bare')
  expect(run.stdin).toBe('Grade this')
})

test('returns structured_output', async () => {
  process.env.FAKE_CLAUDE_OUTPUT = '{"ok":false}'
  expect(await call()).toEqual({ ok: false })
})

test('retries failed calls with 2s, 6s, 18s then throws failed', async () => {
  process.env.FAKE_CLAUDE_MODE = 'bad-json'
  const err = await call().catch((e) => e)
  expect(err).toBeInstanceOf(ClaudeError)
  expect(err.code).toBe('failed')
  expect(runs().length).toBe(4)
  expect(waits).toEqual([2000, 6000, 18000])
})

test('missing structured_output counts as failed', async () => {
  process.env.FAKE_CLAUDE_MODE = 'schema-miss'
  const err = await call({ delaysMs: [] }).catch((e) => e)
  expect(err.code).toBe('failed')
})

test('succeeds after one failure', async () => {
  process.env.FAKE_CLAUDE_MODE = 'fail-then-ok'
  expect(await call()).toEqual({ ok: true })
  expect(waits).toEqual([2000])
})

test('does not retry usage limit', async () => {
  process.env.FAKE_CLAUDE_MODE = 'limit'
  const err = await call().catch((e) => e)
  expect(err.code).toBe('limit')
  expect(runs().length).toBe(1)
})

test('does not retry auth', async () => {
  process.env.FAKE_CLAUDE_MODE = 'auth'
  const err = await call().catch((e) => e)
  expect(err.code).toBe('auth')
  expect(runs().length).toBe(1)
})

test('kills the process after the timeout', async () => {
  process.env.FAKE_CLAUDE_MODE = 'hang'
  const started = Date.now()
  const err = await call({ timeoutMs: 300, delaysMs: [] }).catch((e) => e)
  expect(err.code).toBe('failed')
  expect(Date.now() - started).toBeLessThan(5000)
})

test('missing binary is failed, not a crash', async () => {
  const err = await call({ bin: path.join(dir, 'nope'), delaysMs: [] }).catch((e) => e)
  expect(err).toBeInstanceOf(ClaudeError)
  expect(err.code).toBe('failed')
})
