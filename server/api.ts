import fs from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import type { Attempt, Overview, Question, Settings, TodayList } from '../src/lib/types'
import { localToday } from '../src/lib/day'
import { addExtra, buildToday, ensureToday } from '../src/lib/today'
import { ClaudeError, runClaude } from './claude'
import { readTopicOrder } from './roadmap'
import { createStateStore, type StateStore } from './state'
import { StudyError, createStudyService, type StudyService } from './study'
import { TutorCliError, createTutorCli, type TutorCli } from './tutor'
import { BadPath } from './vault'

/** Where the API reads its config and keeps its state. */
export interface ApiPaths {
  configFile: string
  dataDir: string
}

/** The injectable edges of the API, all optional outside tests. */
export interface ApiDeps {
  claude?: <T>(prompt: string, schema: object) => Promise<T>
  today?: () => string
  prefetch?: boolean
  python?: string
}

/** The values read from tutor.config.json, with defaults applied. */
interface ApiConfig {
  vault: string
  claudeBin: string
  timezone: string
}

/** Everything the route handlers share, built once on the first request. */
interface ApiContext {
  config: ApiConfig
  tutor: TutorCli
  store: StateStore
  study: StudyService
  today: () => string
}

/** A client mistake that maps straight to an HTTP status. */
class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'HttpError'
  }
}

/** Reads tutor.config.json, expanding `~/` and filling in the documented defaults. */
export function loadConfig(file: string): ApiConfig {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, unknown>
  const vault = typeof raw.vault === 'string' ? raw.vault.trim() : ''
  if (!vault) throw new Error(`vault is required in ${file}`)
  return {
    vault: expandHome(vault),
    claudeBin: expandHome(typeof raw.claudeBin === 'string' && raw.claudeBin ? raw.claudeBin : '~/.local/bin/claude'),
    timezone: typeof raw.timezone === 'string' && raw.timezone ? raw.timezone : 'Asia/Ho_Chi_Minh',
  }
}

/** Builds the Connect middleware that serves the tutor HTTP API. */
export function createApiMiddleware(
  paths: ApiPaths,
  deps: ApiDeps = {},
): (req: IncomingMessage, res: ServerResponse, next: () => void) => void {
  const prefetch = deps.prefetch !== false && process.env.TUTOR_NO_PREFETCH !== '1'
  let ready: Promise<ApiContext> | null = null

  /** Builds the shared context once, retrying after a failed start. */
  function context(): Promise<ApiContext> {
    if (!ready) {
      ready = build().catch((err) => {
        ready = null
        throw err
      })
    }
    return ready
  }

  /** Creates the tutor CLI, state store and study service from the config. */
  async function build(): Promise<ApiContext> {
    const config = loadConfig(paths.configFile)
    const tutor = createTutorCli({ vault: config.vault, python: deps.python })
    const store = createStateStore(path.join(paths.dataDir, 'state.json'))
    const today = deps.today ?? (() => localToday(config.timezone))
    let claude = deps.claude
    if (!claude) {
      fs.mkdirSync(paths.dataDir, { recursive: true })
      claude = <T>(prompt: string, schema: object) =>
        runClaude<T>({ prompt, schema, bin: config.claudeBin, cwd: paths.dataDir })
    }
    const study = createStudyService({
      vault: config.vault,
      vaultName: path.basename(config.vault),
      tutor,
      store,
      claude,
      today,
    })
    return { config, tutor, store, study, today }
  }

  /** Handles one API request, mapping every failure onto a JSON response. */
  async function serve(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    try {
      if (!notCrossSite(req) || (req.method === 'POST' && !sameOrigin(req))) return send(res, 403, { error: 'forbidden origin' })
      const ctx = await context()
      const body = req.method === 'POST' ? await readJson(req) : undefined
      await dispatch(ctx, req, res, url, body)
    } catch (err) {
      fail(res, err)
    }
  }

  /** Routes one request once the context and body are available. */
  async function dispatch(
    ctx: ApiContext,
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
    body: unknown,
  ): Promise<void> {
    switch (`${req.method} ${url.pathname}`) {
      case 'GET /api/overview':
        return send(res, 200, await overview(ctx))
      case 'POST /api/today/extra':
        return send(res, 200, await todayExtra(ctx))
      case 'GET /api/lesson':
        return send(res, 200, await ctx.study.getLesson(query(url, 'point')))
      case 'GET /api/bank':
        return send(res, 200, await ctx.study.getBank(query(url, 'point')))
      case 'GET /api/question':
        return send(res, 200, await pickQuestion(ctx, query(url, 'point'), kindOf(query(url, 'kind'))))
      case 'POST /api/bank/regenerate':
        return send(res, 200, await ctx.study.regenerateBank(field(body, 'point')))
      case 'POST /api/pretest':
        return send(res, 200, await ctx.study.submitPretest(field(body, 'point'), pretestAnswer(record(body).answer)))
      case 'POST /api/answer':
        return send(
          res,
          200,
          await ctx.study.submit({
            point: field(body, 'point'),
            q: field(body, 'q'),
            kind: kindOf(field(body, 'kind')),
            answer: field(body, 'answer'),
          }),
        )
      case 'POST /api/attempt/retry':
        return send(res, 200, await ctx.study.retry(field(body, 'id')))
      case 'POST /api/attempt/confirm':
        return send(res, 200, await ctx.study.confirm(field(body, 'id')))
      case 'POST /api/attempt/appeal':
        return send(res, 200, await ctx.study.appeal(field(body, 'id'), field(body, 'reason')))
      case 'GET /api/attempts':
        return send(res, 200, await ctx.study.attemptsFor(query(url, 'point')))
      case 'GET /api/open-attempts':
        return send(res, 200, await ctx.study.openAttempts())
      case 'POST /api/settings':
        return send(res, 200, await ctx.study.updateSettings(settingsPatch(body)))
      case 'GET /api/health':
        return send(res, 200, health(ctx))
      default:
        return send(res, 404, { error: 'not found' })
    }
  }

  /** Builds today's list once per day, then prefetches it in the background. */
  async function overview(ctx: ApiContext): Promise<Overview> {
    const date = ctx.today()
    const [exp, due] = await Promise.all([ctx.tutor.exportData(date), ctx.tutor.due(date)])
    const topicOrder = readTopicOrder(ctx.config.vault)
    const settings = await ctx.study.getSettings()
    const list = await ctx.store.update((s) =>
      (s.today = ensureToday(
        s.today,
        () =>
          buildToday({
            date,
            due,
            points: exp.points,
            topicOrder,
            cap: exp.config.daily_review_cap,
            newPerDay: settings.newPerDay,
          }),
        date,
      )),
    )
    if (prefetch) void ctx.study.prefetch([...list.review, ...list.fresh, ...list.extra])
    return { today: date, export: exp, topicOrder, list, settings, vaultName: path.basename(ctx.config.vault) }
  }

  /** Locks today's list if needed, then appends one optional item to it. */
  async function todayExtra(ctx: ApiContext): Promise<TodayList> {
    const date = ctx.today()
    const [exp, due] = await Promise.all([ctx.tutor.exportData(date), ctx.tutor.due(date)])
    const topicOrder = readTopicOrder(ctx.config.vault)
    return ctx.store.update((s) => {
      const current = ensureToday(
        s.today,
        () =>
          buildToday({
            date,
            due,
            points: exp.points,
            topicOrder,
            cap: exp.config.daily_review_cap,
            newPerDay: s.settings.newPerDay,
          }),
        date,
      )
      return (s.today = addExtra(current, exp.points, topicOrder, due))
    })
  }

  /** Picks the next question of one point, after loading its bank. */
  async function pickQuestion(ctx: ApiContext, pointId: string, kind: 'learn' | 'review'): Promise<Question> {
    const bank = await ctx.study.getBank(pointId)
    const point = (await ctx.tutor.exportData(ctx.today())).points.find((p) => p.id === pointId)
    if (!point) throw new StudyError('not-found', `No point ${pointId}`)
    return ctx.study.pickQuestion(point, bank, kind)
  }

  /** Reports the last Claude failure and whether the vault looks like a tutor vault. */
  function health(ctx: ApiContext): { claude: { lastError: Attempt['error'] | null }; vault: boolean } {
    return {
      claude: { lastError: ctx.study.lastClaudeError() },
      vault: fs.existsSync(path.join(ctx.config.vault, 'Tutor', 'Points')),
    }
  }

  return (req, res, next) => {
    const url = parseUrl(req)
    if (!url || !url.pathname.startsWith('/api/')) {
      next()
      return
    }
    void serve(req, res, url)
  }
}

/** Writes one JSON response with no caching. */
function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(body))
}

/** Collects the request body as UTF-8 text, rejecting anything over `limit` bytes. */
function readBody(req: IncomingMessage, limit = 1_000_000): Promise<string> {
  return new Promise((resolve, reject) => {
    let text = ''
    let size = 0
    let done = false
    req.setEncoding('utf8')
    req.on('data', (chunk: string) => {
      if (done) return
      size += Buffer.byteLength(chunk, 'utf8')
      if (size > limit) {
        done = true
        reject(new HttpError(400, 'request body too large'))
        return
      }
      text += chunk
    })
    req.on('end', () => {
      if (!done) resolve(text)
    })
    req.on('error', (err) => {
      if (done) return
      done = true
      reject(err)
    })
  })
}

/** Parses a JSON request body, treating an empty body as `{}`. */
async function readJson(req: IncomingMessage): Promise<unknown> {
  const text = await readBody(req)
  if (!text.trim()) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new HttpError(400, 'invalid JSON body')
  }
}

/** Accepts a POST only from the page served by this very host. */
function sameOrigin(req: IncomingMessage): boolean {
  return localHost(req) && req.headers.origin === `http://${req.headers.host}`
}

/** True when the Host header names this machine (blocks DNS rebinding). */
function localHost(req: IncomingMessage): boolean {
  const host = req.headers.host
  if (!host) return false
  try {
    const hostname = new URL(`http://${host}`).hostname
    return hostname === '127.0.0.1' || hostname === 'localhost'
  } catch {
    return false
  }
}

/** False for any request a browser marks as coming from another site, so GETs with side effects stay local. */
function notCrossSite(req: IncomingMessage): boolean {
  if (!localHost(req)) return false
  const site = req.headers['sec-fetch-site']
  if (site !== undefined && site !== 'same-origin' && site !== 'none') return false
  const origin = req.headers.origin
  return origin === undefined || origin === `http://${req.headers.host}`
}

/** Parses the request URL, or null when it is malformed. */
function parseUrl(req: IncomingMessage): URL | null {
  try {
    return new URL(req.url ?? '/', 'http://localhost')
  } catch {
    return null
  }
}

/** Expands a leading `~/` to the home directory. */
function expandHome(value: string): string {
  return value.startsWith('~/') ? path.join(os.homedir(), value.slice(2)) : value
}

/** Reads one required, non-empty query parameter. */
function query(url: URL, name: string): string {
  const value = url.searchParams.get(name)
  if (!value) throw new HttpError(400, `missing ${name}`)
  return value
}

/** Narrows a JSON body to an object. */
function record(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'expected a JSON object')
  }
  return body as Record<string, unknown>
}

/** Reads one required, non-empty string field of a JSON body. */
function field(body: unknown, key: string): string {
  const value = record(body)[key]
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, `missing ${key}`)
  return value
}

/** Validates the learn/review question kind. */
function kindOf(value: unknown): 'learn' | 'review' {
  if (value === 'learn' || value === 'review') return value
  throw new HttpError(400, 'kind must be learn or review')
}

/** Accepts a pretest answer as a string or as null for "skip". */
function pretestAnswer(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (typeof value !== 'string') throw new HttpError(400, 'answer must be a string or null')
  return value
}

/** Validates a settings patch and keeps only the two known keys. */
function settingsPatch(body: unknown): Partial<Settings> {
  const b = record(body)
  for (const key of Object.keys(b)) {
    if (key !== 'newPerDay' && key !== 'englishFeedback') throw new HttpError(400, `unknown setting ${key}`)
  }
  const patch: Partial<Settings> = {}
  if ('newPerDay' in b) {
    const value = b.newPerDay
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 10) {
      throw new HttpError(400, 'newPerDay must be an integer 1-10')
    }
    patch.newPerDay = value
  }
  if ('englishFeedback' in b) {
    if (typeof b.englishFeedback !== 'boolean') throw new HttpError(400, 'englishFeedback must be a boolean')
    patch.englishFeedback = b.englishFeedback
  }
  return patch
}

/** Maps any thrown value onto the documented status and JSON shape. */
function fail(res: ServerResponse, err: unknown): void {
  if (res.headersSent) {
    res.end()
    return
  }
  if (err instanceof HttpError) return send(res, err.status, { error: err.message })
  if (err instanceof StudyError) {
    const status = err.code === 'bad-state' ? 409 : err.code === 'not-found' ? 404 : 422
    return send(res, status, { error: err.message, code: err.code })
  }
  if (err instanceof ClaudeError) return send(res, 503, { error: err.message, code: err.code })
  if (err instanceof TutorCliError) return send(res, 502, { error: err.message })
  if (err instanceof BadPath) return send(res, 400, { error: 'bad path' })
  return send(res, 500, { error: err instanceof Error ? err.message : String(err) })
}
