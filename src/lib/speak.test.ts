import { afterEach, expect, test, vi } from 'vitest'
import { pickVoice, speak } from './speak'

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
