import fs from 'node:fs'
import http from 'node:http'
import type { AddressInfo } from 'node:net'
import path from 'node:path'
import { runBackups } from './backups'
import { createApiMiddleware } from './api'

export interface ServerOptions {
  /** where state.json and backups/ live */
  dataDir: string
  port: number
  /** the built site (index.html + assets) */
  staticDir: string
  /** tutor.config.json; default <dataDir>/tutor.config.json, else `fallbackConfig` */
  configFile?: string
  /** the tutor.config.json shipped with the install */
  fallbackConfig?: string
  now?: () => number
}

export interface RunningServer {
  url: string
  dataDir: string
  stop(): Promise<void>
}

/** A setup mistake the server refuses to start with. */
export class StartError extends Error {}

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
}

const BACKUP_EVERY_MS = 60 * 60 * 1000

/** The folder of this checkout, if `dir` is inside one: the data must never live where git or a rebuild can touch it. */
function projectAbove(dir: string): string | null {
  for (let d = dir; ; d = path.dirname(d)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(path.join(d, 'package.json'), 'utf8')) as { name?: string }
      if (pkg.name === 'tutor-learner') return d
    } catch {
      // no package.json here
    }
    if (path.dirname(d) === d) return null
  }
}

function serveStatic(staticDir: string, req: http.IncomingMessage, res: http.ServerResponse) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.statusCode = 405
    return res.end()
  }
  let pathname: string
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname)
  } catch {
    res.statusCode = 400
    return res.end()
  }
  const file = path.resolve(staticDir, `.${pathname}`)
  if (file !== staticDir && !file.startsWith(staticDir + path.sep)) {
    res.statusCode = 403
    return res.end()
  }
  const isFile = fs.existsSync(file) && fs.statSync(file).isFile()
  // client routes (/problems/x) get the app; a missing asset is a real 404
  const target = isFile ? file : path.extname(pathname) ? null : path.join(staticDir, 'index.html')
  if (!target) {
    res.statusCode = 404
    return res.end('not found')
  }
  res.setHeader('Content-Type', TYPES[path.extname(target)] ?? 'application/octet-stream')
  res.setHeader('Cache-Control', target.includes(`${path.sep}assets${path.sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache')
  if (req.method === 'HEAD') return res.end()
  fs.createReadStream(target).pipe(res)
}

/** The stable server: the built site plus /api, with the user's data in `dataDir`. */
export async function startServer(o: ServerOptions): Promise<RunningServer> {
  const dataDir = path.resolve(o.dataDir)
  const staticDir = path.resolve(o.staticDir)
  const project = projectAbove(dataDir)
  if (project) throw new StartError(`The data folder ${dataDir} is inside the project folder ${project}: choose a folder outside it`)
  if (!fs.existsSync(path.join(staticDir, 'index.html'))) throw new StartError(`No built site in ${staticDir}`)
  fs.mkdirSync(dataDir, { recursive: true })

  const own = path.join(dataDir, 'tutor.config.json')
  const configFile = o.configFile ?? (fs.existsSync(own) || !o.fallbackConfig ? own : o.fallbackConfig)
  if (!fs.existsSync(configFile)) throw new StartError(`No tutor.config.json at ${configFile}`)

  const stateFile = path.join(dataDir, 'state.json')
  const now = o.now ?? Date.now
  const backup = () => {
    try {
      const r = runBackups(stateFile, path.join(dataDir, 'backups'), now())
      if (r.created) console.log(`Backed up state.json as backups/${r.created}`)
    } catch (e) {
      console.error('Backup failed:', e)
    }
  }
  backup()
  const timer = setInterval(backup, BACKUP_EVERY_MS)
  timer.unref()

  const api = createApiMiddleware({ configFile, dataDir })
  const server = http.createServer((req, res) => {
    void api(req, res, () => serveStatic(staticDir, req, res))
  })
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(o.port, '127.0.0.1', () => resolve())
  })
  const { port } = server.address() as AddressInfo
  return {
    url: `http://localhost:${port}`,
    dataDir,
    stop: () =>
      new Promise((resolve) => {
        clearInterval(timer)
        server.closeAllConnections?.()
        server.close(() => resolve())
      }),
  }
}
