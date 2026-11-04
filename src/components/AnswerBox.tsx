import { useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import { canRecord, useRecorder, type Recording } from '../hooks/useRecorder'
import { stopSpeaking } from '../lib/speak'
import { GOOD_FROM, GOOD_TO, MAX_SECONDS, clock, lengthNote, timeHint } from '../lib/speakingTime'
import type { Voice } from '../lib/types'
import { Working } from './Loading'

/** What the answer box needs from its page. */
interface Props {
  value: string
  onChange(value: string): void
  onSubmit?: () => void
  ariaLabel?: string
  /** topic words that help the transcriber hear technical terms */
  hint: string
  voice: Voice | null
  onVoice(voice: Voice): void
  /** tells the page when a recording is running or being written down */
  onBusy?(busy: boolean): void
  /** shows the spoken-length target; off for quick guesses */
  target?: boolean
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

/** One box for every written answer: type in it, or press the mic and the words land in the same box. */
export function AnswerBox({ value, onChange, onSubmit, ariaLabel = 'Your answer', hint, voice, onVoice, onBusy, target = true }: Props) {
  const [working, setWorking] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [unwritten, setUnwritten] = useState<{ id: string; replace: boolean } | null>(null)
  const typed = useRef(value)
  typed.current = value

  /** Writes down a saved recording; a failure keeps it ready for another try. */
  const transcribe = async (id: string, replace: boolean) => {
    setWorking(true)
    setFailure(null)
    try {
      const { text } = await api.post<{ text: string }>('/api/speech/transcribe', { id, hint })
      onChange(replace || !typed.current.trim() ? text : `${typed.current.trim()} ${text}`)
      setUnwritten(null)
    } catch (e) {
      setUnwritten({ id, replace })
      setFailure(asMsg(e))
    } finally {
      setWorking(false)
    }
  }

  // A new recording replaces the words of the old one; words typed before any recording stay.
  const finished = async ({ blob, seconds }: Recording) => {
    const replace = voice !== null
    setWorking(true)
    setFailure(null)
    try {
      const { id } = await api.upload<{ id: string }>('/api/speech', blob)
      onVoice({ audio: id, seconds })
      await transcribe(id, replace)
    } catch (e) {
      setFailure(asMsg(e))
      setWorking(false)
    }
  }

  const recorder = useRecorder(MAX_SECONDS, (r) => void finished(r))
  const busy = recorder.recording || working

  useEffect(() => onBusy?.(busy), [busy, onBusy])

  const start = () => {
    stopSpeaking() // the microphone must not hear the interviewer
    setFailure(null)
    setUnwritten(null)
    void recorder.start()
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (onSubmit && e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      onSubmit()
    }
  }

  const speakable = canRecord()
  const note = voice ? 'Fix a word, or keep typing' : speakable && target ? `Aim for ${clock(GOOD_FROM)}–${clock(GOOD_TO)}` : ''

  return (
    <div className="answer-wrap">
      {voice && !recorder.recording && (
        <div className="voice-play">
          <audio controls preload="metadata" src={`/api/speech/audio?id=${voice.audio}`} />
          <span className="hint">{clock(voice.seconds)} · {lengthNote(voice.seconds)}</span>
        </div>
      )}
      {recorder.recording ? (
        <div className="answer-box rec">
          <TimeBand seconds={recorder.seconds} />
          <div className="answer-tools">
            <span className="hint">
              <b className="mono" role="timer">{clock(recorder.seconds)}</b> · {timeHint(recorder.seconds)}
            </span>
            <button type="button" className="btn stop" onClick={recorder.stop}>Stop</button>
          </div>
        </div>
      ) : (
        <div className="answer-box">
          <textarea
            className="answer"
            rows={4}
            aria-label={ariaLabel}
            placeholder={speakable ? 'Speak or type your answer…' : 'Type your answer…'}
            value={value}
            disabled={working}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <div className="answer-tools">
            {working ? <Working text="Writing down what you said" /> : <span className="hint">{note}</span>}
            {speakable && (
              <button type="button" className={value.trim() ? 'btn' : 'btn primary'} disabled={working} onClick={start}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                  <rect x="9" y="3" width="6" height="11" rx="3" />
                  <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                </svg>
                {voice ? 'Speak again' : 'Speak'}
              </button>
            )}
          </div>
        </div>
      )}
      {(failure || recorder.error) && <div className="error-box" role="alert">{failure ?? recorder.error}</div>}
      {unwritten && !working && (
        <button type="button" className="btn" onClick={() => void transcribe(unwritten.id, unwritten.replace)}>Try again</button>
      )}
    </div>
  )
}
