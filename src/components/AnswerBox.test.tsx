import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Voice } from '../lib/types'
import { AnswerBox } from './AnswerBox'

const AUDIO_ID = '11111111-1111-4111-8111-111111111111'
let transcribeFails = false
let posts: string[] = []
let stopped = 0

/** A MediaRecorder that hands one chunk over when stopped. */
class FakeRecorder {
  state = 'inactive'
  mimeType = 'audio/webm'
  stream = { getTracks: () => [{ stop: () => { stopped += 1 } }] }
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  start() { this.state = 'recording' }
  stop() {
    this.state = 'inactive'
    this.ondataavailable?.({ data: new Blob(['sound']) })
    this.onstop?.()
  }
}

/** The page side of the box. */
function Host({ start = '', onBusy }: { start?: string; onBusy?: (busy: boolean) => void }) {
  const [value, setValue] = useState(start)
  const [voice, setVoice] = useState<Voice | null>(null)
  return <AnswerBox value={value} onChange={setValue} hint="Coroutines" voice={voice} onVoice={setVoice} onBusy={onBusy} />
}

const box = () => screen.getByRole('textbox', { name: 'Your answer' })

async function speak() {
  await userEvent.click(screen.getByRole('button', { name: /Start speaking|Record again/ }))
  await userEvent.click(await screen.findByRole('button', { name: 'Stop' }))
}

beforeEach(() => {
  transcribeFails = false
  posts = []
  stopped = 0
  vi.stubGlobal('MediaRecorder', FakeRecorder)
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({}) } })
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    posts.push(`${url} ${typeof init.body === 'string' ? init.body : 'blob'}`)
    if (url === '/api/speech') return new Response(JSON.stringify({ id: AUDIO_ID }))
    if (transcribeFails) return new Response(JSON.stringify({ error: 'whisper failed' }), { status: 422 })
    return new Response(JSON.stringify({ text: 'I working at MoMo.' }))
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined })
})

test('spoken words land in the same box, ready to edit, with the recording above', async () => {
  render(<Host />)
  await speak()
  await waitFor(() => expect(box()).toHaveValue('I working at MoMo.'))
  expect(stopped).toBe(1)
  expect(posts.join()).toContain('"hint":"Coroutines"')
  expect(document.querySelector('audio')).toHaveAttribute('src', `/api/speech/audio?id=${AUDIO_ID}`)
  await userEvent.clear(box())
  expect(box()).toHaveValue('')
  await userEvent.type(box(), 'I work at MoMo.')
  expect(box()).toHaveValue('I work at MoMo.')
})

test('speaking after typing keeps the typed words', async () => {
  render(<Host start="First I typed." />)
  await speak()
  await waitFor(() => expect(box()).toHaveValue('First I typed. I working at MoMo.'))
})

test('recording again replaces the words of the old recording', async () => {
  render(<Host />)
  await speak()
  await waitFor(() => expect(box()).toHaveValue('I working at MoMo.'))
  await userEvent.type(box(), ' More.')
  await speak()
  await waitFor(() => expect(box()).toHaveValue('I working at MoMo.'))
})

test('the page knows while a recording runs', async () => {
  const onBusy = vi.fn()
  render(<Host onBusy={onBusy} />)
  await userEvent.click(screen.getByRole('button', { name: 'Start speaking' }))
  await screen.findByRole('button', { name: 'Stop' })
  expect(onBusy).toHaveBeenLastCalledWith(true)
  fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
  await waitFor(() => expect(box()).toHaveValue('I working at MoMo.'))
  await waitFor(() => expect(onBusy).toHaveBeenLastCalledWith(false))
})

test('shows moving dots while the words are written down', async () => {
  let finish: (r: Response) => void = () => {}
  vi.stubGlobal('fetch', (url: string) => (url === '/api/speech'
    ? Promise.resolve(new Response(JSON.stringify({ id: AUDIO_ID })))
    : new Promise<Response>((resolve) => { finish = resolve })))
  render(<Host />)
  await speak()
  expect(await screen.findByRole('status')).toHaveTextContent('Writing down what you said')
  finish(new Response(JSON.stringify({ text: 'Done.' })))
  await waitFor(() => expect(box()).toHaveValue('Done.'))
})

test('a failed transcription keeps the recording for another try', async () => {
  transcribeFails = true
  render(<Host />)
  await speak()
  expect(await screen.findByRole('alert')).toHaveTextContent('whisper failed')
  transcribeFails = false
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
  await waitFor(() => expect(box()).toHaveValue('I working at MoMo.'))
  expect(posts.filter((p) => p.startsWith('/api/speech ')).length).toBe(1)
})

test('a blocked microphone says so and the box still takes typing', async () => {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: async () => { throw new DOMException('no', 'NotAllowedError') } },
  })
  render(<Host />)
  await userEvent.click(screen.getByRole('button', { name: 'Start speaking' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('microphone is blocked')
  await userEvent.type(box(), 'typed')
  expect(box()).toHaveValue('typed')
})

test('without a microphone API there is no mic button', () => {
  vi.stubGlobal('MediaRecorder', undefined)
  render(<Host />)
  expect(screen.queryByRole('button', { name: 'Start speaking' })).toBeNull()
  expect(box()).toHaveAttribute('placeholder', 'Type your answer…')
})
