import { afterEach, expect, test, vi } from 'vitest'
import { pickVoice, speak, speechAvailable, stopSpeaking } from './speak'

afterEach(() => vi.unstubAllGlobals())

const v = (name: string, lang: string) => ({ name, lang }) as SpeechSynthesisVoice

test('prefers an enhanced English voice', () => {
  const voices = [v('Alex', 'en-US'), v('Daniel', 'en-GB'), v('Samantha (Enhanced)', 'en-GB'), v('Zoe (Premium)', 'fr-FR')]
  expect(pickVoice(voices)?.name).toBe('Samantha (Enhanced)')
})

test('falls back to any English voice', () => {
  expect(pickVoice([v('Thomas', 'fr-FR'), v('Karen', 'en-AU'), v('Alex', 'en-US')])?.name).toBe('Alex')
  expect(pickVoice([v('Thomas', 'fr-FR'), v('Karen', 'en-AU')])?.name).toBe('Karen')
  expect(pickVoice([v('Thomas', 'fr-FR')])).toBeNull()
})

test('does nothing without speech synthesis', () => {
  vi.stubGlobal('speechSynthesis', undefined)
  expect(() => speak('Hello')).not.toThrow()
})

test('speaks after cancelling current speech', () => {
  const synth = { cancel: vi.fn(), speak: vi.fn(), getVoices: () => [v('Alex', 'en-US')] }
  vi.stubGlobal('speechSynthesis', synth)
  vi.stubGlobal('SpeechSynthesisUtterance', class { text: string; voice: unknown = null; lang = ''; constructor(t: string) { this.text = t } })
  speak('Hello')
  expect(synth.cancel).toHaveBeenCalled()
  expect(synth.speak).toHaveBeenCalledTimes(1)
})

class Utterance { text: string; voice: unknown = null; lang = ''; constructor(t: string) { this.text = t } }

test('with no voices yet it waits once for voiceschanged, then speaks with the chosen voice', () => {
  const voices: SpeechSynthesisVoice[] = []
  let fire: () => void = () => undefined
  const synth = {
    cancel: vi.fn(), speak: vi.fn(), getVoices: () => voices,
    addEventListener: vi.fn((_: string, f: () => void) => { fire = f }), removeEventListener: vi.fn(),
  }
  vi.stubGlobal('speechSynthesis', synth)
  vi.stubGlobal('SpeechSynthesisUtterance', Utterance)
  speak('Hello')
  expect(synth.speak).not.toHaveBeenCalled()
  voices.push(v('Alex', 'en-US'))
  fire()
  expect(synth.speak).toHaveBeenCalledTimes(1)
  expect((synth.speak.mock.calls[0][0] as Utterance).voice).toMatchObject({ name: 'Alex' })
})

test('with no voices and no event it speaks after a short timeout, once', async () => {
  vi.resetModules() // the wait happens once per page load
  const { speak } = await import('./speak')
  vi.useFakeTimers()
  try {
    const synth = { cancel: vi.fn(), speak: vi.fn(), getVoices: () => [] as SpeechSynthesisVoice[], addEventListener: vi.fn(), removeEventListener: vi.fn() }
    vi.stubGlobal('speechSynthesis', synth)
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance)
    speak('Hello')
    expect(synth.speak).not.toHaveBeenCalled()
    vi.advanceTimersByTime(2000)
    expect(synth.speak).toHaveBeenCalledTimes(1)
    speak('Again') // waited once already: no second wait
    expect(synth.speak).toHaveBeenCalledTimes(2)
  } finally {
    vi.useRealTimers()
  }
})

test('stopSpeaking cancels a speak that is still waiting for voices', async () => {
  vi.resetModules() // the wait happens once per page load
  const { speak, stopSpeaking } = await import('./speak')
  vi.useFakeTimers()
  try {
    const synth = { cancel: vi.fn(), speak: vi.fn(), getVoices: () => [] as SpeechSynthesisVoice[], addEventListener: vi.fn(), removeEventListener: vi.fn() }
    vi.stubGlobal('speechSynthesis', synth)
    vi.stubGlobal('SpeechSynthesisUtterance', Utterance)
    speak('Hello')
    stopSpeaking()
    vi.advanceTimersByTime(2000)
    expect(synth.speak).not.toHaveBeenCalled()
  } finally {
    vi.useRealTimers()
  }
})

test('speechAvailable tells whether speech exists', () => {
  vi.stubGlobal('speechSynthesis', undefined)
  expect(speechAvailable()).toBe(false)
  vi.stubGlobal('speechSynthesis', { cancel: vi.fn() })
  vi.stubGlobal('SpeechSynthesisUtterance', Utterance)
  expect(speechAvailable()).toBe(true)
})
