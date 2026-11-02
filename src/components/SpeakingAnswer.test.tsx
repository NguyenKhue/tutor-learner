import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { SpeakingAnswer } from './SpeakingAnswer'

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
afterEach(() => vi.unstubAllGlobals())

async function speak() {
  const onSubmit = vi.fn()
  render(<SpeakingAnswer hint="Coroutines" onSubmit={onSubmit} onType={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: 'Start speaking' }))
  await userEvent.click(await screen.findByRole('button', { name: 'Stop' }))
  return onSubmit
}

test('speaking shows the text and needs one listen before feedback', async () => {
  const onSubmit = await speak()
  await screen.findByText('I working at MoMo.')
  expect(stopped).toBe(1)
  expect(posts.join()).toContain('"hint":"Coroutines"')
  const feedback = screen.getByRole('button', { name: 'Get feedback' })
  expect(feedback).toBeDisabled()

  fireEvent.play(document.querySelector('audio')!)
  await userEvent.click(feedback)
  expect(onSubmit).toHaveBeenCalledWith('I working at MoMo.', { audio: AUDIO_ID, seconds: expect.any(Number) })
})

test('a misheard word can be fixed before feedback', async () => {
  const onSubmit = await speak()
  await screen.findByText('I working at MoMo.')
  await userEvent.click(screen.getByRole('button', { name: 'Fix a misheard word' }))
  const box = screen.getByRole('textbox', { name: 'What you said' })
  await userEvent.clear(box)
  await userEvent.type(box, 'I working at EPAM.')
  fireEvent.play(document.querySelector('audio')!)
  await userEvent.click(screen.getByRole('button', { name: 'Get feedback' }))
  expect(onSubmit.mock.calls[0][0]).toBe('I working at EPAM.')
})

test('a failed transcription keeps the recording for another try', async () => {
  transcribeFails = true
  await speak()
  expect(await screen.findByRole('alert')).toHaveTextContent('whisper failed')
  transcribeFails = false
  await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
  await screen.findByText('I working at MoMo.')
  await waitFor(() => expect(posts.filter((p) => p.startsWith('/api/speech ')).length).toBe(1))
})

test('a blocked microphone says so and still offers typing', async () => {
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getUserMedia: async () => { throw new DOMException('no', 'NotAllowedError') } },
  })
  render(<SpeakingAnswer hint="x" onSubmit={() => {}} onType={() => {}} />)
  await userEvent.click(screen.getByRole('button', { name: 'Start speaking' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('microphone is blocked')
  expect(screen.getByRole('button', { name: 'Type instead' })).toBeInTheDocument()
})
