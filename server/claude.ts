import { spawn } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'

/** Failure from a headless Claude Code run, classified so callers can react to limits and auth. */
export class ClaudeError extends Error {
  constructor(public code: 'limit' | 'auth' | 'failed', message: string) {
    super(message)
    this.name = 'ClaudeError'
  }
}

/** Output patterns that mean "stop retrying" rather than "try again". */
export const ERROR_PATTERNS = {
  limit: /usage limit|rate limit|limit reached|quota/i,
  auth: /not logged in|please run \/login|authentication|unauthorized|invalid api key|\b401\b/i,
}

interface RunClaudeOptions {
  prompt: string
  schema: object
  bin: string
  cwd: string
  timeoutMs?: number
  delaysMs?: number[]
  sleep?: (ms: number) => Promise<void>
  model?: string
}

/** Runs the Claude Code CLI headless with a JSON schema, retrying transient failures and returning structured_output. */
export async function runClaude<T>(opts: RunClaudeOptions): Promise<T> {
  const {
    prompt,
    schema,
    bin,
    cwd,
    timeoutMs = 90_000,
    delaysMs = [2000, 6000, 18000],
    sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)),
    model = 'sonnet',
  } = opts

  const executable = bin.startsWith('~/') ? path.join(os.homedir(), bin.slice(2)) : bin
  const args = [
    '-p', '--model', model, '--tools', '', '--setting-sources', '', '--no-session-persistence',
    '--output-format', 'json', '--json-schema', JSON.stringify(schema),
  ]

  let last: ClaudeError | undefined
  for (let i = 0; i <= delaysMs.length; i++) {
    if (i > 0) await sleep(delaysMs[i - 1])
    try {
      return (await attemptOnce(executable, args, prompt, cwd, timeoutMs)) as T
    } catch (err) {
      const failure = err instanceof ClaudeError ? err : new ClaudeError('failed', String(err))
      if (failure.code !== 'failed') throw failure
      last = failure
    }
  }
  throw last!
}

function attemptOnce(bin: string, args: string[], prompt: string, cwd: string, timeoutMs: number): Promise<unknown> {
  return new Promise<unknown>((resolve, reject) => {
    let child: ReturnType<typeof spawn>
    try {
      child = spawn(bin, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] })
    } catch (err) {
      reject(new ClaudeError('failed', `could not run claude: ${(err as Error).message}`))
      return
    }

    let stdout = ''
    let stderr = ''
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined

    const settle = (fn: () => void) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      fn()
    }

    child.stdout!.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk))
    child.stderr!.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk))
    child.stdin!.on('error', () => {}) // the child may exit before reading stdin (EPIPE)
    child.on('error', (err) => settle(() => reject(new ClaudeError('failed', `could not run claude: ${err.message}`))))
    child.on('close', (code) => settle(() => settleExit(code)))

    timer = setTimeout(() => {
      child.kill('SIGKILL')
      settle(() => reject(new ClaudeError('failed', `claude timed out after ${timeoutMs / 1000}s`)))
    }, timeoutMs)

    try {
      child.stdin!.end(prompt)
    } catch {}

    function settleExit(code: number | null) {
      const text = `${stdout}\n${stderr}`
      const parsed = parseJson(stdout)
      if (code === 0 && parsed?.is_error === false && isObject(parsed.structured_output)) {
        resolve(parsed.structured_output)
        return
      }
      const detail = typeof parsed?.result === 'string' ? `${text}\n${parsed.result}` : text
      if (ERROR_PATTERNS.limit.test(detail)) {
        reject(new ClaudeError('limit', brief(parsed?.result ?? text) || 'claude usage limit reached'))
        return
      }
      if (ERROR_PATTERNS.auth.test(detail)) {
        reject(new ClaudeError('auth', brief(parsed?.result ?? text) || 'claude is not authenticated'))
        return
      }
      reject(new ClaudeError('failed', `claude exited with code ${code ?? -1}: ${truncate(text.trim(), 300)}`))
    }
  })
}

function parseJson(text: string): any {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function brief(text: string): string {
  return truncate(text.trim().split('\n').find((line) => line.trim())?.trim() ?? '', 200)
}
