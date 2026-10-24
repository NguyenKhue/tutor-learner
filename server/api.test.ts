import fs from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, test } from 'vitest'
import type { Question } from '../src/lib/types'
import { createApiMiddleware } from './api'
import { ClaudeError } from './claude'
import { GRADE_SCHEMA, LESSON_SCHEMA, QUESTIONS_SCHEMA } from './prompts'
import { CLASSIFY_SCHEMA, READING_GRADE_SCHEMA, READING_QUIZ_SCHEMA } from './reading/prompts'
import { makeTestVault } from './testVault'

const DATE = '2026-10-22'
const P1 = 'Kotlin/01 Null safety'
const openQ = (q: string): Question => ({ q, kind: 'open', prompt: q, criteria: ['a', 'b'] })
let cleanups: Array<() => void | Promise<void>> = []
afterEach(async () => {
  for (const c of cleanups.reverse()) await c()
  cleanups = []
})

async function start(opts: { claudeFail?: ClaudeError } = {}) {
  const v = makeTestVault(
    [
      { topic: 'Kotlin', name: '01 Null safety', type: 'concept', order: 1, sources: ['[[Notes/A]]'] },
      { topic: 'Kotlin', name: '02 Orphan', type: 'concept', order: 2, sources: ['[[Notes/Missing]]'] },
    ],
    { files: { 'Notes/A.md': 'A', 'Notes/Read.md': '# Read\nSee ![[fig.png]]', 'Notes/fig.png': 'PNGDATA', 'Notes/pic.svg': '<svg/>' } },
  )
  cleanups.push(v.cleanup)
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tutor-api-'))
  cleanups.push(() => fs.rmSync(dataDir, { recursive: true, force: true }))
  const configFile = path.join(dataDir, 'tutor.config.json')
  fs.writeFileSync(configFile, JSON.stringify({ vault: v.vault, claudeBin: '/nonexistent', timezone: 'Asia/Ho_Chi_Minh' }))
  let day = DATE
  const claude = async <T>(prompt: string, schema: object): Promise<T> => {
    if (opts.claudeFail) throw opts.claudeFail
    if (schema === LESSON_SCHEMA) return { markdown: 'L' } as T
    if (schema === QUESTIONS_SCHEMA) return { questions: [{ q: 'q1', kind: 'pretest', prompt: 'p', criteria: ['k'] }, openQ('q2'), openQ('q3'), openQ('q4')] } as T
    if (schema === GRADE_SCHEMA) return { grade: { ok: true, why: 'good', missing: [], feedback: 'f' }, english: null } as T
    if (schema === CLASSIFY_SCHEMA) return { notes: [...prompt.matchAll(/^PATH: (.+)$/gm)].map((m) => ({ path: m[1], topic: 'Kotlin', priority: 'high', minutes: 3, why: 'w' })) } as T
    if (schema === READING_QUIZ_SCHEMA) return { questions: ['a', 'b', 'c'].map((q) => ({ q, kind: 'open', prompt: q, criteria: ['x', 'y'] })) } as T
    if (schema === READING_GRADE_SCHEMA) return { results: ['r1', 'r2', 'r3'].map((q) => ({ q, ok: true, why: 'w', missing: [], feedback: 'f' })), english: null } as T
    throw new Error('schema')
  }
  const mw = createApiMiddleware({ configFile, dataDir }, { claude, today: () => day, prefetch: false })
  const server = http.createServer((req, res) => mw(req as never, res as never, () => {
    res.statusCode = 404
    res.end('next')
  }))
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  cleanups.push(() => new Promise<void>((r) => server.close(() => r())))
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  const get = async (p: string) => {
    const r = await fetch(base + p)
    return { status: r.status, body: await r.json() }
  }
  const post = async (p: string, body: unknown, origin: string | null = base) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (origin) headers.Origin = origin
    const r = await fetch(base + p, { method: 'POST', headers, body: JSON.stringify(body) })
    return { status: r.status, body: await r.json() }
  }
  return { base, get, post, vault: v.vault, setDay: (d: string) => (day = d) }
}

test('overview locks today\'s list', async () => {
  const s = await start()
  const a = await s.get('/api/overview')
  expect(a.status).toBe(200)
  expect(a.body.today).toBe(DATE)
  expect(a.body.export.points).toHaveLength(2)
  expect(a.body.list).toEqual({ date: DATE, review: [], fresh: [P1, 'Kotlin/02 Orphan'], extra: [], reading: [] })
  expect(a.body.topicOrder).toEqual(['Kotlin'])
  expect(a.body.settings.newPerDay).toBe(3)
  expect(a.body.vaultName).toBe(path.basename(s.vault))
  const b = await s.get('/api/overview')
  expect(b.body.list).toEqual(a.body.list)
})

test('answer flow records through tutor.py', async () => {
  const s = await start()
  const q = await s.get(`/api/question?point=${encodeURIComponent(P1)}&kind=learn`)
  expect(q.body.q).toBe('q2')
  const a = await s.post('/api/answer', { point: P1, q: 'q2', kind: 'learn', answer: 'x' })
  expect(a.status).toBe(200)
  expect(a.body.state).toBe('recorded')
  const o = await s.get('/api/overview')
  expect(o.body.export.points.find((p: { id: string }) => p.id === P1).history).toHaveLength(1)
  const list = await s.get(`/api/attempts?point=${encodeURIComponent(P1)}`)
  expect(list.body).toHaveLength(1)
})

test('lesson route returns markdown and obsidian url', async () => {
  const s = await start()
  const l = await s.get(`/api/lesson?point=${encodeURIComponent(P1)}`)
  expect(l.body.markdown).toBe('L')
  expect(l.body.obsidianUrl).toContain('obsidian://open?vault=')
})

test('post without origin is rejected 403', async () => {
  const s = await start()
  expect((await s.post('/api/settings', { newPerDay: 4 }, null)).status).toBe(403)
})

test('post with foreign origin is rejected 403', async () => {
  const s = await start()
  expect((await s.post('/api/settings', { newPerDay: 4 }, 'http://evil.example')).status).toBe(403)
})

test('no-sources maps to 422', async () => {
  const s = await start()
  const r = await s.get(`/api/lesson?point=${encodeURIComponent('Kotlin/02 Orphan')}`)
  expect(r.status).toBe(422)
  expect(r.body.code).toBe('no-sources')
})

test('unknown point maps to 404', async () => {
  const s = await start()
  expect((await s.get('/api/bank?point=Kotlin%2F99%20Nope')).status).toBe(404)
})

test('limit maps to 503 with code limit', async () => {
  const s = await start({ claudeFail: new ClaudeError('limit', 'usage limit reached') })
  const r = await s.get(`/api/bank?point=${encodeURIComponent(P1)}`)
  expect(r.status).toBe(503)
  expect(r.body.code).toBe('limit')
  const h = await s.get('/api/health')
  expect(h.body.claude.lastError).toEqual({ code: 'limit', message: 'usage limit reached' })
  expect(h.body.vault).toBe(true)
})

test('settings rejects newPerDay 0', async () => {
  const s = await start()
  expect((await s.post('/api/settings', { newPerDay: 0 })).status).toBe(400)
  const ok = await s.post('/api/settings', { newPerDay: 5, englishFeedback: false })
  expect(ok.body).toEqual({ newPerDay: 5, englishFeedback: false, readingReviewsPerDay: 3 })
  expect((await s.post('/api/settings', { readingReviewsPerDay: 0 })).body.readingReviewsPerDay).toBe(0)
  expect((await s.post('/api/settings', { readingReviewsPerDay: 11 })).status).toBe(400)
})

test('bad json is 400', async () => {
  const s = await start()
  const r = await fetch(s.base + '/api/answer', { method: 'POST', headers: { Origin: s.base }, body: '{nope' })
  expect(r.status).toBe(400)
})

test('today extra appends one item', async () => {
  const s = await start()
  await s.post('/api/settings', { newPerDay: 1 })
  const o = await s.get('/api/overview')
  expect(o.body.list.fresh).toEqual([P1])
  const e = await s.post('/api/today/extra', {})
  expect(e.body.extra).toEqual(['Kotlin/02 Orphan'])
})

test('non-api paths fall through', async () => {
  const s = await start()
  const r = await fetch(s.base + '/index.html')
  expect(await r.text()).toBe('next')
})

test('cross-site GET is rejected before any work', async () => {
  const s = await start()
  const site = await fetch(`${s.base}/api/lesson?point=${encodeURIComponent(P1)}`, { headers: { 'Sec-Fetch-Site': 'cross-site' } })
  expect(site.status).toBe(403)
  const origin = await fetch(`${s.base}/api/overview`, { headers: { Origin: 'http://evil.example' } })
  expect(origin.status).toBe(403)
  expect(fs.existsSync(path.join(s.vault, 'Tutor/Lessons/Kotlin/01 Null safety.md'))).toBe(false)
  const same = await fetch(`${s.base}/api/health`, { headers: { 'Sec-Fetch-Site': 'same-origin' } })
  expect(same.status).toBe(200)
})

test('foreign Host header is rejected (DNS rebinding)', async () => {
  const s = await start()
  const port = new URL(s.base).port
  const status = await new Promise<number>((resolve) => {
    http.get({ host: '127.0.0.1', port, path: '/api/health', headers: { Host: `evil.example:${port}` } }, (res) => resolve(res.statusCode ?? 0))
  })
  expect(status).toBe(403)
})

const NOTE = 'Notes/Read.md'
const enc = encodeURIComponent

test('reading overview lists notes and classifies them', async () => {
  const s = await start()
  const before = await s.get('/api/reading')
  expect(before.body.items.map((i: { path: string }) => i.path)).toEqual(['Notes/A.md', NOTE])
  expect(before.body.classify).toMatchObject({ total: 2, done: 0 })
  const after = await s.post('/api/reading/classify', {})
  expect(after.status).toBe(200)
  await new Promise((r) => setTimeout(r, 300))
  const done = await s.get('/api/reading')
  expect(done.body.classify).toMatchObject({ total: 2, done: 2, running: false })
  expect(done.body.upNext).toContain(NOTE)
})

test('reading check flow through the api', async () => {
  const s = await start()
  const note = await s.get(`/api/reading/note?path=${enc(NOTE)}`)
  expect(note.body.markdown).toContain('See ![[fig.png]]')
  const quiz = await s.post('/api/reading/quiz', { path: NOTE })
  expect(quiz.body.questions.map((q: { q: string }) => q.q)).toEqual(['r1', 'r2', 'r3'])
  const check = await s.post('/api/reading/check', { path: NOTE, answers: { r1: 'a', r2: 'b', r3: 'c' } })
  expect(check.body).toMatchObject({ state: 'graded', passed: true })
  const bad = await s.post('/api/reading/check', { path: NOTE, answers: 'nope' })
  expect(bad.status).toBe(400)
  const skip = await s.post('/api/reading/skip', { path: 'Notes/A.md', skipped: true })
  expect(skip.status).toBe(200)
})

test('image route serves a vault image and 404s outside', async () => {
  const s = await start()
  const ok = await fetch(`${s.base}/api/vault-image?note=${enc(NOTE)}&src=fig.png`)
  expect(ok.status).toBe(200)
  expect(ok.headers.get('content-type')).toBe('image/png')
  expect(await ok.text()).toBe('PNGDATA')
  const svg = await fetch(`${s.base}/api/vault-image?note=${enc(NOTE)}&src=pic.svg`)
  expect(svg.headers.get('content-security-policy')).toBe('sandbox')
  expect((await fetch(`${s.base}/api/vault-image?note=${enc(NOTE)}&src=${enc('../../etc/passwd.png')}`)).status).toBe(404)
  expect((await fetch(`${s.base}/api/vault-image?note=${enc(NOTE)}&src=Read.md`)).status).toBe(404)
})

test('today locks due reading notes and counts them', async () => {
  const s = await start()
  await s.post('/api/reading/quiz', { path: NOTE })
  await s.post('/api/reading/check', { path: NOTE, answers: { r1: 'a', r2: 'b', r3: 'c' } })
  s.setDay('2026-10-29')
  const o = await s.get('/api/overview')
  expect(o.body.list.reading).toEqual([NOTE])
  expect(o.body.reading[NOTE]).toEqual({ title: 'Read', topic: null, done: false, kind: 'recheck' })
  await s.post('/api/reading/check', { path: NOTE, answers: { r1: 'a', r2: 'b', r3: 'c' } })
  const again = await s.get('/api/overview')
  expect(again.body.list.reading).toEqual([NOTE])
  expect(again.body.reading[NOTE].done).toBe(true)
})

test('reading routes refuse cross-site requests', async () => {
  const s = await start()
  expect((await fetch(`${s.base}/api/reading`, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(403)
  expect((await fetch(`${s.base}/api/vault-image?note=${enc(NOTE)}&src=fig.png`, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status).toBe(403)
})
