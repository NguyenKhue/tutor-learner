import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { SpeechError, createSpeech, isAudioId } from './speech'

let dirs: string[] = []
afterEach(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true })
  dirs = []
})

/** A speech service over fake tools; the fake ffmpeg copies its input to its last argument. */
function setup(whisperOutput: string) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tutor-speech-'))
  dirs.push(root)
  const ffmpegBin = path.join(root, 'ffmpeg')
  fs.writeFileSync(ffmpegBin, '#!/bin/sh\nfor a; do last="$a"; done\nwhile [ "$1" != "-i" ]; do shift; done\ncp "$2" "$last"\n', { mode: 0o755 })
  const whisperBin = path.join(root, 'whisper')
  const argsFile = path.join(root, 'args')
  fs.writeFileSync(whisperBin, `#!/bin/sh\necho "$@" > "${argsFile}"\nprintf '%s' '${whisperOutput}'\n`, { mode: 0o755 })
  const model = path.join(root, 'model.bin')
  fs.writeFileSync(model, 'm')
  const dir = path.join(root, 'audio')
  return { dir, argsFile, model, speech: createSpeech({ dir, ffmpegBin, whisperBin, model }) }
}

test('saves a recording and removes the raw upload', async () => {
  const { speech, dir } = setup('x')
  const id = await speech.save(Buffer.from('sound'))
  expect(isAudioId(id)).toBe(true)
  expect(fs.readdirSync(dir)).toEqual([`${id}.m4a`])
  expect(fs.readFileSync(speech.file(id)!, 'utf8')).toBe('sound')
})

test('transcribes with the hint, cleans the text and leaves no wav behind', async () => {
  const { speech, dir, argsFile } = setup(' I working at MoMo.\n [BLANK_AUDIO] (music)\n It is good.\n')
  const id = await speech.save(Buffer.from('sound'))
  await expect(speech.transcribe(id, 'Coroutines')).resolves.toBe('I working at MoMo. It is good.')
  expect(fs.readFileSync(argsFile, 'utf8')).toContain('--prompt Coroutines')
  expect(fs.readdirSync(dir)).toEqual([`${id}.m4a`])
})

test('reports silence as no speech', async () => {
  const { speech } = setup(' [BLANK_AUDIO]\n')
  const id = await speech.save(Buffer.from('sound'))
  await expect(speech.transcribe(id)).rejects.toMatchObject({ code: 'no-speech' })
})

test('a missing model or tool says so, and the recording stays for a retry', async () => {
  const { speech, model } = setup('x')
  const id = await speech.save(Buffer.from('sound'))
  fs.rmSync(model)
  await expect(speech.transcribe(id)).rejects.toMatchObject({ code: 'missing-tool' })
  expect(speech.file(id)).not.toBeNull()

  const none = createSpeech({ dir: path.dirname(speech.file(id)!), ffmpegBin: '/nonexistent/ffmpeg', whisperBin: '/nonexistent/w', model: '/x' })
  await expect(none.save(Buffer.from('s'))).rejects.toBeInstanceOf(SpeechError)
})

test('never touches a path that is not an audio id', async () => {
  const { speech } = setup('x')
  expect(speech.file('../../etc/passwd')).toBeNull()
  await expect(speech.transcribe('../x')).rejects.toMatchObject({ code: 'not-found' })
})

test('one failed run does not block the next', async () => {
  const { speech, model } = setup('hello')
  const id = await speech.save(Buffer.from('sound'))
  fs.rmSync(model)
  const failed = speech.transcribe(id)
  await expect(failed).rejects.toBeInstanceOf(SpeechError)
  fs.writeFileSync(model, 'm')
  await expect(speech.transcribe(id)).resolves.toBe('hello')
})

test('prune removes only recordings older than 30 days', async () => {
  const { speech, dir } = setup('x')
  const oldId = await speech.save(Buffer.from('old'))
  const newId = await speech.save(Buffer.from('new'))
  const old = new Date(Date.now() - 31 * 86_400_000)
  fs.utimesSync(path.join(dir, `${oldId}.m4a`), old, old)
  speech.prune()
  expect(speech.file(oldId)).toBeNull()
  expect(speech.file(newId)).not.toBeNull()
})
