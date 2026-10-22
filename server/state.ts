import fs from 'node:fs/promises'
import path from 'node:path'
import type { AppState } from '../src/lib/types'

export interface StateStore {
  read(): Promise<AppState>
  /** Runs `fn` on a copy of the state and saves the copy only if `fn` returns without throwing. */
  update<T>(fn: (s: AppState) => T | Promise<T>): Promise<T>
}

export function emptyState(): AppState {
  return { version: 1, banks: {}, attempts: [], today: null, settings: { newPerDay: 3, englishFeedback: true } }
}

function validateState(v: unknown): AppState {
  const s = v as Partial<AppState> | null
  if (!s || typeof s !== 'object' || s.version !== 1) throw new Error('unknown state version')
  if (typeof s.banks !== 'object' || !Array.isArray(s.attempts) || typeof s.settings !== 'object') throw new Error('missing fields')
  return { ...emptyState(), ...s, settings: { ...emptyState().settings, ...s.settings } } as AppState
}

/**
 * The on-disk state: read once, then kept in memory; writes are serialized and
 * atomically renamed into place. A corrupt file is set aside, never overwritten.
 */
export function createStateStore(file: string): StateStore {
  let cache: AppState | undefined
  let chain: Promise<unknown> = Promise.resolve()

  const load = async (): Promise<AppState> => {
    if (cache) return cache
    let raw: string
    try {
      raw = await fs.readFile(file, 'utf8')
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return (cache = emptyState())
      throw e
    }
    try {
      cache = validateState(JSON.parse(raw))
    } catch (e) {
      const aside = `${file}.corrupt-${Date.now()}`
      await fs.rename(file, aside).catch(() => {})
      console.warn(`[state] ${file} is not a valid state file (${(e as Error).message}); moved it to ${aside}`)
      cache = emptyState()
    }
    return cache
  }

  const write = async (next: AppState): Promise<void> => {
    await fs.mkdir(path.dirname(file), { recursive: true })
    const tmp = `${file}.tmp`
    await fs.writeFile(tmp, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    await fs.rename(tmp, file)
  }

  /** Everything runs in order, so no two writes can interleave. */
  const serial = <T>(run: () => Promise<T>): Promise<T> => {
    const next = chain.then(run)
    chain = next.then(
      () => undefined,
      () => undefined,
    )
    return next
  }

  return {
    read: () => serial(async () => structuredClone(await load())),
    update: (fn) =>
      serial(async () => {
        const next = structuredClone(await load())
        const result = await fn(next)
        await write(next)
        cache = next
        return result
      }),
  }
}
