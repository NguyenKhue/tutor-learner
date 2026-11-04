import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { Voice } from '../lib/types'
import { InterviewAnswer, type AnswerPhase } from './InterviewAnswer'

const AUDIO_ID = '11111111-1111-4111-8111-111111111111'
let posts: string[] = []
let transcribeFails = false
let release: (() => void) | null = null // holds the transcription open so the waiting step can be seen

class FakeRecorder {
  state = 'inactive'
  mimeType = 'audio/webm'
  stream = { getTracks: () => [{ stop: () => undefined }] }
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
  posts = []
  transcribeFails = false
  release = null
  vi.stubGlobal('MediaRecorder', FakeRecorder)
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: async () => ({}) } })
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    posts.push(`${url} ${typeof init.body === 'string' ? init.body : 'blob'}`)
    if (url === '/api/speech') return new Response(JSON.stringify({ id: AUDIO_ID }))
    await new Promise<void>((done) => { release = done })
    if (transcribeFails) return new Response(JSON.stringify({ error: 'whisper failed' }), { status: 422 })
    return new Response(JSON.stringify({ text: 'First I measure it.' }))
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined })
})

function setup() {
  const sent: { text: string; voice: Voice | null }[] = []
  const phases: AnswerPhase[] = []
  render(
    <InterviewAnswer target={[120, 240]} hint="System design" busy={false} onPhase={(p) => phases.push(p)}
      onSend={async (text, voice) => { sent.push({ text, voice }) }}>
      <button type="button">Skip question</button>
    </InterviewAnswer>,
  )
  return { sent, phases }
}

test('record, wait for Whisper, then check the words and send them with the recording', async () => {
  const user = userEvent.setup()
  const { sent, phases } = setup()
  expect(screen.getByText(/Aim for 2:00 to 4:00/)).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Start answering' }))
  expect(await screen.findByText('Recording. Keep talking.')).toBeInTheDocument()
  expect(screen.queryByRole('textbox')).toBeNull() // no words while speaking
  expect(screen.getByRole('button', { name: 'Skip question' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Finish answer' }))
  expect(await screen.findByText('Turning your answer into text')).toBeInTheDocument()
  await waitFor(() => expect(release).not.toBeNull())
  release?.()
  const box = await screen.findByRole('textbox', { name: 'Your answer' })
  expect(box).toHaveValue('First I measure it.')
  expect(screen.getByRole('button', { name: 'Hear my recording' })).toBeInTheDocument()
  expect(screen.getByText(/a bit short/)).toBeInTheDocument()
  await user.type(box, ' Then I fix it.')
  await user.click(screen.getByRole('button', { name: 'Send answer' }))
  expect(sent).toHaveLength(1)
  expect(sent[0].text).toBe('First I measure it. Then I fix it.')
  expect(sent[0].voice?.audio).toBe(AUDIO_ID)
  expect(phases).toEqual(expect.arrayContaining(['idle', 'recording', 'processing', 'ready']))
  expect(posts.join()).toContain('"hint":"System design"')
})

test('Start over drops the recording without sending it to Whisper', async () => {
  const user = userEvent.setup()
  setup()
  await user.click(screen.getByRole('button', { name: 'Start answering' }))
  await user.click(await screen.findByRole('button', { name: 'Start over' }))
  expect(screen.getByRole('button', { name: 'Start answering' })).toBeInTheDocument()
  expect(posts).toEqual([])
})

test('a Whisper failure offers Try again, Record again and Type instead', async () => {
  const user = userEvent.setup()
  transcribeFails = true
  setup()
  await user.click(screen.getByRole('button', { name: 'Start answering' }))
  await user.click(await screen.findByRole('button', { name: 'Finish answer' }))
  await waitFor(() => expect(release).not.toBeNull())
  release?.()
  expect(await screen.findByRole('alert')).toHaveTextContent('whisper failed')
  expect(screen.getByRole('button', { name: 'Try again' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Record again' })).toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: 'Type instead' }))
  expect(screen.getByRole('textbox', { name: 'Your answer' })).toHaveValue('')
})

test('Type instead opens an empty box straight away', async () => {
  const user = userEvent.setup()
  const { sent } = setup()
  await user.click(screen.getByRole('button', { name: 'Type instead' }))
  await user.type(screen.getByRole('textbox', { name: 'Your answer' }), 'Typed')
  await user.click(screen.getByRole('button', { name: 'Send answer' }))
  expect(sent[0]).toEqual({ text: 'Typed', voice: null })
  expect(screen.getByRole('button', { name: 'Speak instead' })).toBeInTheDocument()
})
