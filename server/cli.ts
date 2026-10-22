import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { StartError, startServer } from './main'

/** Arguments of the bundled server: --data <dir> --port <n> --static <dir> [--config <file>] [--role <name>]. */
export function parseArgs(argv: string[]): { data: string; port: number; static: string; config?: string; role: string } {
  const out: Record<string, string> = { role: 'stable' }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    if (!['--data', '--port', '--static', '--config', '--role'].includes(flag)) throw new StartError(`Unknown argument "${flag}"`)
    const value = argv[i + 1]
    if (value === undefined || value.startsWith('--')) throw new StartError(`${flag} needs a value`)
    out[flag.slice(2)] = value
    i++
  }
  for (const required of ['data', 'port', 'static']) if (!out[required]) throw new StartError(`--${required} is required`)
  const port = Number(out.port)
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new StartError('--port must be a whole number from 0 to 65535')
  return { data: out.data, port, static: out.static, config: out.config, role: out.role }
}

/** The command line entry of the stable server (the file that is bundled and started). */
async function run() {
  const here = path.dirname(fileURLToPath(import.meta.url))
  let args: ReturnType<typeof parseArgs>
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (e) {
    console.error(`Cannot start: ${(e as Error).message}`)
    process.exit(2)
  }
  try {
    const server = await startServer({
      dataDir: args.data,
      port: args.port,
      staticDir: args.static,
      configFile: args.config,
      fallbackConfig: path.join(here, 'tutor.config.json'),
    })
    let version = ''
    try {
      version = fs.readFileSync(path.join(here, 'VERSION'), 'utf8').split('\n')[0].slice(0, 8)
    } catch {
      // a dev run has no VERSION
    }
    console.log(`tutor-learner (${args.role}${version ? ` ${version}` : ''}) is serving ${server.dataDir} at ${server.url}`)
    const stop = () => {
      server
        .stop()
        .catch((e: unknown) => console.error('Error while stopping', e))
        .finally(() => process.exit(0))
    }
    process.on('SIGINT', stop)
    process.on('SIGTERM', stop)
  } catch (e) {
    if (e instanceof StartError) {
      console.error(`Cannot start: ${e.message}`)
      process.exit(2)
    }
    throw e
  }
}

const isEntry = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (isEntry) {
  run().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
