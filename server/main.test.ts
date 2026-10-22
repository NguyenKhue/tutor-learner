import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from './cli'
import { makeTestVault } from './testVault'
import { StartError, startServer, type RunningServer } from './main'

let tmp: string
let dataDir: string
let siteDir: string
const running: RunningServer[] = []
let vaultCleanup: () => void

beforeEach(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tutor-server-'))
  dataDir = path.join(tmp, 'data')
  siteDir = path.join(tmp, 'site')
  fs.mkdirSync(path.join(siteDir, 'assets'), { recursive: true })
  fs.writeFileSync(path.join(siteDir, 'index.html'), '<!doctype html><title>app</title>')
  fs.writeFileSync(path.join(siteDir, 'assets', 'a.js'), 'console.log(1)')
  fs.writeFileSync(path.join(tmp, 'secret.txt'), 'nope')
  const v = makeTestVault([{ topic: 'Kotlin', name: '01 Null safety', type: 'memory', order: 1 }])
  vaultCleanup = v.cleanup
  fs.writeFileSync(path.join(tmp, 'tutor.config.json'), JSON.stringify({ vault: v.vault, claudeBin: '/nonexistent' }))
})
afterEach(async () => {
  await Promise.all(running.splice(0).map((s) => s.stop()))
  fs.rmSync(tmp, { recursive: true, force: true })
  vaultCleanup()
})

async function start() {
  const s = await startServer({ dataDir, port: 0, staticDir: siteDir, fallbackConfig: path.join(tmp, 'tutor.config.json') })
  running.push(s)
  return s
}

/** Raw request, so paths like /../ reach the server unnormalized. */
function request(url: string, pathname: string, init: { method?: string; body?: string; origin?: string } = {}) {
  const { port } = new URL(url)
  return new Promise<{ status: number; type: string; body: string }>((resolve, reject) => {
    const headers: Record<string, string> = init.origin ? { Origin: init.origin } : {}
    const req = http.request({ host: '127.0.0.1', port, path: pathname, method: init.method ?? 'GET', headers }, (res) => {
      let body = ''
      res.setEncoding('utf8')
      res.on('data', (c: string) => (body += c))
      res.on('end', () => resolve({ status: res.statusCode ?? 0, type: String(res.headers['content-type'] ?? ''), body }))
    })
    req.on('error', reject)
    req.end(init.body)
  })
}

test('serves the app for client routes and assets with their type', async () => {
  const s = await start()
  for (const p of ['/', '/problems/lru-cache']) {
    const r = await request(s.url, p)
    expect(r.status).toBe(200)
    expect(r.type).toMatch(/text\/html/)
    expect(r.body).toContain('<title>app</title>')
  }
  const js = await request(s.url, '/assets/a.js')
  expect(js.type).toMatch(/javascript/)
  expect(js.body).toBe('console.log(1)')
  expect((await request(s.url, '/assets/missing.js')).status).toBe(404)
})

test('refuses paths outside the site folder', async () => {
  const s = await start()
  for (const p of ['/../secret.txt', '/%2e%2e/secret.txt']) {
    const r = await request(s.url, p)
    expect(r.body).not.toContain('nope')
    expect([403, 404]).toContain(r.status)
  }
})

test('keeps the data in the data folder across restarts', async () => {
  const first = await start()
  const health = JSON.parse((await request(first.url, '/api/health')).body)
  expect(health).toEqual({ claude: { lastError: null }, vault: true })
  const origin = `http://127.0.0.1:${new URL(first.url).port}`
  const saved = await request(first.url, '/api/settings', { method: 'POST', body: JSON.stringify({ newPerDay: 5 }), origin })
  expect(saved.status).toBe(200)
  await first.stop()
  running.splice(running.indexOf(first), 1)

  const second = await start()
  const overview = JSON.parse((await request(second.url, '/api/overview')).body)
  expect(overview.settings.newPerDay).toBe(5)
  expect(JSON.parse(fs.readFileSync(path.join(dataDir, 'state.json'), 'utf8')).settings.newPerDay).toBe(5)
  // the restart made the day's backup of the existing data
  expect(fs.readdirSync(path.join(dataDir, 'backups'))).toHaveLength(1)
})

test('refuses a data folder inside the project', async () => {
  await expect(
    startServer({ dataDir: path.resolve(__dirname, '..', '.data-stable-test'), port: 0, staticDir: siteDir, fallbackConfig: path.join(tmp, 'tutor.config.json') }),
  ).rejects.toThrow(StartError)
  expect(fs.existsSync(path.resolve(__dirname, '..', '.data-stable-test'))).toBe(false)
})

test('refuses to start without a built site', async () => {
  fs.rmSync(path.join(siteDir, 'index.html'))
  await expect(start()).rejects.toThrow(/No built site/)
})

test('parses the command line', () => {
  expect(parseArgs(['--data', '/d', '--port', '4175', '--static', '/s', '--role', 'stable'])).toEqual({
    data: '/d',
    port: 4175,
    static: '/s',
    config: undefined,
    role: 'stable',
  })
  expect(() => parseArgs(['--data', '/d', '--port', '4175'])).toThrow(/--static is required/)
  expect(() => parseArgs(['--data', '/d', '--port', 'x', '--static', '/s'])).toThrow(/port/)
  expect(() => parseArgs(['--nope'])).toThrow(/Unknown/)
})
