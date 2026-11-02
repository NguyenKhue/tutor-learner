import { execFile } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const KEEP_DAYS = 30
const RUN_TIMEOUT_MS = 120_000
const AUDIO_ID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/
/** Non-speech tags Whisper prints instead of words, such as [BLANK_AUDIO] or (music). */
const NON_SPEECH = /\[[^\]]*\]|\([^)]*\)/g

/** A speech failure; `no-speech` and `missing-tool` carry a message worth showing as is. */
export class SpeechError extends Error {
  constructor(public code: 'missing-tool' | 'no-speech' | 'failed' | 'not-found', message: string) {
    super(message)
    this.name = 'SpeechError'
  }
}

/** The local tools and folder the speech service runs on. */
export interface SpeechOptions {
  dir: string
  ffmpegBin: string
  whisperBin: string
  model: string
  now?: () => number
  timeoutMs?: number
}

/** Saves recordings and turns them into text on this Mac. */
export interface SpeechService {
  /** Stores a browser recording as a seekable .m4a and returns its id. */
  save(audio: Buffer): Promise<string>
  /** Writes down a saved recording; `hint` names the topic so technical words are heard right. */
  transcribe(id: string, hint?: string): Promise<string>
  /** The saved file of an id, or null when the id is invalid or the file has gone. */
  file(id: string): string | null
  /** Removes recordings older than the keep window. */
  prune(): void
}

/** True for the ids `save` hands out; anything else never reaches the file system. */
export function isAudioId(id: unknown): id is string {
  return typeof id === 'string' && AUDIO_ID.test(id)
}

/** Creates the speech service; one conversion or transcription runs at a time. */
export function createSpeech(options: SpeechOptions): SpeechService {
  const { dir, ffmpegBin, whisperBin, model } = options
  const now = options.now ?? Date.now
  const timeout = options.timeoutMs ?? RUN_TIMEOUT_MS
  let queue: Promise<unknown> = Promise.resolve()

  /** Runs `task` after everything already queued, whether or not that failed. */
  function serial<T>(task: () => Promise<T>): Promise<T> {
    const run = queue.then(task, task)
    queue = run.catch(() => undefined)
    return run
  }

  /** Runs one tool and returns its stdout, naming a missing tool in the error. */
  function run(bin: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(bin, args, { timeout, maxBuffer: 10_000_000 }, (err, stdout) => {
        if (!err) return resolve(stdout)
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
          return reject(new SpeechError('missing-tool', `${path.basename(bin)} is not installed`))
        }
        reject(new SpeechError('failed', `${path.basename(bin)} failed`))
      })
    })
  }

  const audioFile = (id: string) => path.join(dir, `${id}.m4a`)

  return {
    save(audio) {
      return serial(async () => {
        fs.mkdirSync(dir, { recursive: true })
        const id = randomUUID()
        const input = path.join(dir, `${id}.input`)
        fs.writeFileSync(input, audio)
        try {
          await run(ffmpegBin, ['-y', '-loglevel', 'error', '-i', input, '-vn', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', audioFile(id)])
        } finally {
          fs.rmSync(input, { force: true })
        }
        return id
      })
    },

    transcribe(id, hint) {
      return serial(async () => {
        const file = this.file(id)
        if (!file) throw new SpeechError('not-found', 'This recording is gone. Record again.')
        if (!fs.existsSync(model)) throw new SpeechError('missing-tool', `The Whisper model is missing: ${model}`)
        const wav = path.join(dir, `${id}.wav`)
        try {
          await run(ffmpegBin, ['-y', '-loglevel', 'error', '-i', file, '-ar', '16000', '-ac', '1', '-c:a', 'pcm_s16le', wav])
          const args = ['-m', model, '-f', wav, '-l', 'en', '-nt', '-np', ...(hint ? ['--prompt', hint] : [])]
          const text = (await run(whisperBin, args)).replace(NON_SPEECH, ' ').replace(/\s+/g, ' ').trim()
          if (!text) throw new SpeechError('no-speech', 'No speech heard. Check the microphone and record again.')
          return text
        } finally {
          fs.rmSync(wav, { force: true })
        }
      })
    },

    file(id) {
      if (!isAudioId(id)) return null
      const file = audioFile(id)
      return fs.existsSync(file) ? file : null
    },

    prune() {
      if (!fs.existsSync(dir)) return
      const cutoff = now() - KEEP_DAYS * 86_400_000
      for (const name of fs.readdirSync(dir)) {
        const file = path.join(dir, name)
        if (fs.statSync(file).mtimeMs < cutoff) fs.rmSync(file, { force: true })
      }
    },
  }
}
