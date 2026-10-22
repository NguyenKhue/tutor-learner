import { spawn } from 'node:child_process'
import path from 'node:path'
import type { DuePoint, ExportData, RecordResult } from '../src/lib/types'

/** Failure reported by the tutor.py CLI (or by failing to spawn it). */
export class TutorCliError extends Error {
  constructor(message: string, public exitCode: number) {
    super(message)
    this.name = 'TutorCliError'
  }
}

export interface TutorCli {
  exportData(date: string): Promise<ExportData>
  due(date: string): Promise<DuePoint[]>
  next(date: string): Promise<{ mode: 'review' | 'learn' | 'none'; point?: string; reason?: string }>
  record(a: { point: string; ok: boolean; kind: 'learn' | 'review'; q: string; why: string; date: string }): Promise<RecordResult>
}

/** A TutorCli whose record calls are serialized so vault writes never race. */
export function createTutorCli(opts: { vault: string; script?: string; python?: string }): TutorCli {
  const script = opts.script ?? path.join(opts.vault, '.claude/skills/tutor/scripts/tutor.py')
  const python = opts.python ?? 'python3'
  let queue: Promise<unknown> = Promise.resolve()

  function call<T>(date: string, cmd: string, args: string[] = []): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const child = spawn(python, [script, '--vault', opts.vault, '--date', date, cmd, ...args], {
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      let stdout = ''
      let stderr = ''
      child.stdout.setEncoding('utf8').on('data', (chunk: string) => (stdout += chunk))
      child.stderr.setEncoding('utf8').on('data', (chunk: string) => (stderr += chunk))
      child.on('error', (err) => reject(new TutorCliError(err.message, -1)))
      child.on('close', (code) => {
        if (code === 0) {
          try {
            resolve(JSON.parse(stdout) as T)
          } catch (err) {
            reject(new TutorCliError((err as Error).message, 0))
          }
          return
        }
        reject(new TutorCliError(failureMessage(stdout, stderr, code), code ?? -1))
      })
    })
  }

  return {
    exportData: (date) => call<ExportData>(date, 'export'),
    due: async (date) => (await call<{ points: DuePoint[] }>(date, 'due')).points,
    next: (date) => call<{ mode: 'review' | 'learn' | 'none'; point?: string; reason?: string }>(date, 'next'),
    record: (a) => {
      const task = queue.then(() =>
        call<RecordResult>(a.date, 'record', [
          '--point', a.point,
          a.ok ? '--ok' : '--fail',
          '--kind', a.kind,
          '--q', a.q,
          '--why', a.why,
        ]),
      )
      queue = task.catch(() => undefined)
      return task
    },
  }
}

function failureMessage(stdout: string, stderr: string, code: number | null): string {
  try {
    const parsed = JSON.parse(stdout) as { error?: unknown }
    if (typeof parsed.error === 'string' && parsed.error) return parsed.error
  } catch {}
  const trimmed = stderr.trim()
  return trimmed || `tutor.py exited with code ${code}`
}
