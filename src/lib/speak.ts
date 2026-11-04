const ENGLISH = /^en[-_](US|GB)$/i

/** The best English voice: an enhanced en-US/en-GB one, else en-US, else any English, else null. */
export function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const good = voices.find((v) => ENGLISH.test(v.lang) && /premium|enhanced/i.test(v.name))
  return good ?? voices.find((v) => /^en[-_]US$/i.test(v.lang)) ?? voices.find((v) => /^en([-_]|$)/i.test(v.lang)) ?? null
}

/** True where the browser can read text aloud. */
export function speechAvailable(): boolean {
  return typeof speechSynthesis !== 'undefined' && !!speechSynthesis && typeof SpeechSynthesisUtterance !== 'undefined'
}

const VOICE_WAIT_MS = 800
let waitedForVoices = false
let latest = 0

/** Runs `go` now when voices are loaded; else once, waits for `voiceschanged` (or a short timeout) first. */
function whenVoices(go: () => void): void {
  const synth = speechSynthesis
  if (synth.getVoices().length > 0 || waitedForVoices || typeof synth.addEventListener !== 'function') return go()
  waitedForVoices = true
  let done = false
  const finish = () => {
    if (done) return
    done = true
    clearTimeout(timer)
    synth.removeEventListener?.('voiceschanged', finish)
    go()
  }
  const timer = setTimeout(finish, VOICE_WAIT_MS)
  synth.addEventListener('voiceschanged', finish)
}

/** Reads `text` aloud, replacing any speech in progress. Does nothing where speech is missing. */
export function speak(text: string): void {
  if (!speechAvailable()) return
  const mine = ++latest
  speechSynthesis.cancel()
  whenVoices(() => {
    if (mine !== latest) return // a newer speak or a stop came in while waiting
    const utterance = new SpeechSynthesisUtterance(text)
    const voice = pickVoice(speechSynthesis.getVoices())
    if (voice) {
      utterance.voice = voice
      utterance.lang = voice.lang
    } else {
      utterance.lang = 'en-US'
    }
    speechSynthesis.speak(utterance)
  })
}

/** Stops any speech in progress, including one still waiting for voices. */
export function stopSpeaking(): void {
  latest++
  if (typeof speechSynthesis !== 'undefined' && speechSynthesis) speechSynthesis.cancel()
}
