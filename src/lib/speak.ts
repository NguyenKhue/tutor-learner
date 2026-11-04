const ENGLISH = /^en[-_](US|GB)$/i

/** The best English voice: an enhanced en-US/en-GB one, else en-US, else any English, else null. */
export function pickVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const good = voices.find((v) => ENGLISH.test(v.lang) && /premium|enhanced/i.test(v.name))
  return good ?? voices.find((v) => /^en[-_]US$/i.test(v.lang)) ?? voices.find((v) => /^en([-_]|$)/i.test(v.lang)) ?? null
}

/** Reads `text` aloud, replacing any speech in progress. Does nothing where speech is missing. */
export function speak(text: string): void {
  if (typeof speechSynthesis === 'undefined' || !speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') return
  speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  const voice = pickVoice(speechSynthesis.getVoices())
  if (voice) {
    utterance.voice = voice
    utterance.lang = voice.lang
  } else {
    utterance.lang = 'en-US'
  }
  speechSynthesis.speak(utterance)
}

/** Stops any speech in progress. */
export function stopSpeaking(): void {
  if (typeof speechSynthesis !== 'undefined' && speechSynthesis) speechSynthesis.cancel()
}
