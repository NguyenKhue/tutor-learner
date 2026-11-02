import { useState } from 'react'
import { api } from '../api/client'
import { useRecorder, type Recording } from '../hooks/useRecorder'
import { GOOD_FROM, GOOD_TO, MAX_SECONDS, clock, timeHint } from '../lib/speakingTime'
import type { Voice } from '../lib/types'

/** What the speaking card needs from the study flow. */
interface Props {
  /** topic words that help the transcriber hear technical terms */
  hint: string
  busy?: boolean
  onSubmit(text: string, voice: Voice): void
  onType(): void
}

const percent = (seconds: number) => `${(seconds / MAX_SECONDS) * 100}%`
const asMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** The time bar: green marks a good answer length. */
function TimeBand({ seconds }: { seconds: number }) {
  return (
    <div className="time-band" aria-hidden="true">
      <div className="time-track">
        <span className="time-zone" style={{ left: percent(GOOD_FROM), width: percent(GOOD_TO - GOOD_FROM) }} />
        <span className="time-fill" style={{ width: percent(Math.min(seconds, MAX_SECONDS)) }} />
      </div>
      <div className="time-ticks">
        {[0, GOOD_FROM, GOOD_TO, MAX_SECONDS].map((t) => (
          <span key={t} style={{ left: percent(t) }}>{clock(t)}</span>
        ))}
      </div>
    </div>
  )
}

/** Speak, listen back, then ask for feedback; every step keeps the recording so a failure loses nothing. */
export function SpeakingAnswer({ hint, busy = false, onSubmit, onType }: Props) {
  const [voice, setVoice] = useState<Voice | null>(null)
  const [text, setText] = useState<string | null>(null)
  const [working, setWorking] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [heard, setHeard] = useState(false)
  const [fixing, setFixing] = useState(false)

  /** Writes down a saved recording; a failure leaves it ready for another try. */
  const transcribe = async (id: string) => {
    setWorking(true)
    setFailure(null)
    try {
      const r = await api.post<{ text: string }>('/api/speech/transcribe', { id, hint })
      setText(r.text)
    } catch (e) {
      setFailure(asMsg(e))
    } finally {
      setWorking(false)
    }
  }

  const finished = async ({ blob, seconds }: Recording) => {
    setWorking(true)
    setFailure(null)
    try {
      const { id } = await api.upload<{ id: string }>('/api/speech', blob)
      setVoice({ audio: id, seconds })
      await transcribe(id)
    } catch (e) {
      setFailure(asMsg(e))
      setWorking(false)
    }
  }

  const recorder = useRecorder(MAX_SECONDS, (r) => void finished(r))

  const again = () => {
    setVoice(null)
    setText(null)
    setFailure(null)
    setHeard(false)
    setFixing(false)
    void recorder.start()
  }

  if (recorder.recording) {
    return (
      <div className="speak">
        <div className="speak-time" role="timer">{clock(recorder.seconds)}</div>
        <TimeBand seconds={recorder.seconds} />
        <div className="row spread">
          <span className="hint">{timeHint(recorder.seconds)}</span>
          <button type="button" className="btn stop" onClick={recorder.stop}>Stop</button>
        </div>
      </div>
    )
  }

  if (working) return <p className="hint">Writing down what you said…</p>

  if (!voice || text === null) {
    return (
      <div className="speak">
        {failure && <div className="error-box" role="alert">{failure}</div>}
        {recorder.error && <div className="error-box" role="alert">{recorder.error}</div>}
        {voice ? (
          <div className="row">
            <button type="button" className="btn primary" onClick={() => void transcribe(voice.audio)}>Try again</button>
            <button type="button" className="btn" onClick={again}>Record again</button>
          </div>
        ) : (
          <button type="button" className="btn primary speak-start" onClick={again}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <rect x="9" y="3" width="6" height="11" rx="3" />
              <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
            </svg>
            Start speaking
          </button>
        )}
        <div className="row spread">
          <span className="hint">Aim for {clock(GOOD_FROM)}–{clock(GOOD_TO)}. Speak in English.</span>
          <button type="button" className="btn ghost" onClick={onType}>Type instead</button>
        </div>
      </div>
    )
  }

  return (
    <div className="speak">
      <audio controls preload="metadata" src={`/api/speech/audio?id=${voice.audio}`} onPlay={() => setHeard(true)} />
      {fixing ? (
        <textarea className="answer" rows={4} aria-label="What you said" value={text} onChange={(e) => setText(e.target.value)} />
      ) : (
        <p className="transcript">{text}</p>
      )}
      {!heard && <p className="hint">Listen once first. Heard a mistake? Record again.</p>}
      <div className="row">
        <button type="button" className="btn primary" disabled={!heard || busy || !text.trim()} onClick={() => onSubmit(text, voice)}>
          Get feedback
        </button>
        <button type="button" className="btn" disabled={busy} onClick={again}>Record again</button>
        {!fixing && (
          <button type="button" className="btn ghost" onClick={() => setFixing(true)}>Fix a misheard word</button>
        )}
      </div>
    </div>
  )
}
