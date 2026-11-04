import { useEffect, useRef, useState, type ReactNode } from 'react'
import { api } from '../api/client'
import { useMicLevels } from '../hooks/useMicLevels'
import { canRecord, useRecorder, type Recording } from '../hooks/useRecorder'
import { recordLimit, zoneOf, type Target } from '../lib/answerTime'
import { stopSpeaking } from '../lib/speak'
import { clock } from '../lib/speakingTime'
import type { Voice } from '../lib/types'

/** Where a spoken answer is: not started, being recorded, being written down by Whisper, or ready to check and send. */
export type AnswerPhase = 'idle' | 'recording' | 'processing' | 'ready'

interface Props {
  target: Target
  /** topic words that help the transcriber hear technical terms */
  hint: string
  /** the page is posting: sending is off */
  busy: boolean
  onSend(text: string, voice: Voice | null): Promise<unknown>
  onPhase?(phase: AnswerPhase): void
  /** quiet actions on the right of the footer, such as Skip and End */
  children?: ReactNode
}

const BARS = 36
const asMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))
const zoneText = (t: Target) => `${clock(t[0])} to ${clock(t[1])}`

/** The timer ring: the pale arc is the green zone, the solid arc is the time spoken so far. */
function Ring({ seconds, target, frozen }: { seconds: number; target: Target; frozen?: boolean }) {
  const limit = recordLimit(target)
  const c = 2 * Math.PI * 74
  const at = (s: number) => (Math.min(s, limit) / limit) * c
  const zone = zoneOf(seconds, target)
  const label = frozen ? 'Recorded' : zone === 'short' ? 'Keep going' : zone === 'good' ? 'Green zone' : 'Wrap up'
  return (
    <div className={`ring ${frozen ? 'frozen' : zone}`}>
      <svg viewBox="0 0 168 168" aria-hidden="true">
        <circle className="ring-track" cx="84" cy="84" r="74" />
        <circle className="ring-zone" cx="84" cy="84" r="74" strokeDasharray={`${at(target[1]) - at(target[0])} ${c}`} strokeDashoffset={-at(target[0])} transform="rotate(-90 84 84)" />
        <circle className="ring-fill" cx="84" cy="84" r="74" strokeDasharray={`${at(seconds)} ${c}`} transform="rotate(-90 84 84)" />
      </svg>
      <span className="ring-center">
        <b role="timer">{clock(seconds)}</b>
        <span>{label}</span>
      </span>
    </div>
  )
}

/** Moving bars: the real loudness of the microphone when the browser can measure it, else a calm loop. */
function MicBars({ levels }: { levels: number[] | null }) {
  return (
    <div className={levels ? 'mic-bars live' : 'mic-bars'} aria-hidden="true">
      {Array.from({ length: BARS }, (_, i) => (
        <i key={i} style={levels ? { transform: `scaleY(${0.12 + levels[i] * 0.88})` } : undefined} />
      ))}
    </div>
  )
}

/**
 * A spoken interview answer in three clear steps: record (Finish answer), wait while Whisper writes it down,
 * then check the words and send. Typing stays possible from the first step on.
 */
export function InterviewAnswer({ target, hint, busy, onSend, onPhase, children }: Props) {
  const speakable = canRecord()
  const [phase, setPhase] = useState<AnswerPhase>(speakable ? 'idle' : 'ready')
  const [text, setText] = useState('')
  const [voice, setVoice] = useState<Voice | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const [unwritten, setUnwritten] = useState<string | null>(null) // a saved recording Whisper failed on
  const [spoken, setSpoken] = useState(0)
  const [playing, setPlaying] = useState(false)
  const audio = useRef<HTMLAudioElement>(null)
  const generation = useRef(0) // a cancelled transcription must not land in the box

  useEffect(() => {
    onPhase?.(phase)
  }, [phase, onPhase])

  const transcribe = async (id: string, gen: number) => {
    setPhase('processing')
    setFailure(null)
    try {
      const out = await api.post<{ text: string }>('/api/speech/transcribe', { id, hint })
      if (gen !== generation.current) return
      setText(out.text)
      setUnwritten(null)
      setPhase('ready')
    } catch (e) {
      if (gen !== generation.current) return
      setUnwritten(id)
      setFailure(asMsg(e))
    }
  }

  const finished = async ({ blob, seconds }: Recording) => {
    const gen = generation.current
    setSpoken(seconds)
    setPhase('processing')
    setFailure(null)
    try {
      const { id } = await api.upload<{ id: string }>('/api/speech', blob)
      if (gen !== generation.current) return
      setVoice({ audio: id, seconds })
      await transcribe(id, gen)
    } catch (e) {
      if (gen !== generation.current) return
      setFailure(asMsg(e))
    }
  }

  const recorder = useRecorder(recordLimit(target), (r) => void finished(r))
  const levels = useMicLevels(recorder.stream, BARS)

  // The recorder reports when the microphone really started (or failed to).
  useEffect(() => {
    if (recorder.recording) setPhase('recording')
  }, [recorder.recording])
  useEffect(() => {
    if (recorder.error) setPhase((p) => (p === 'recording' ? 'idle' : p))
  }, [recorder.error])

  const record = () => {
    generation.current += 1
    stopSpeaking() // the microphone must not hear the interviewer
    audio.current?.pause()
    setPlaying(false)
    setFailure(null)
    setUnwritten(null)
    setText('')
    setVoice(null)
    void recorder.start()
  }
  const startOver = () => {
    generation.current += 1
    recorder.cancel()
    setPhase('idle')
  }
  const typeInstead = () => {
    generation.current += 1
    setFailure(null)
    setUnwritten(null)
    setVoice(null)
    setPhase('ready')
  }
  const send = async () => {
    if (busy || text.trim() === '') return
    await onSend(text, voice)
  }
  const togglePlay = () => {
    const el = audio.current
    if (!el) return
    if (el.paused) void el.play().then(() => setPlaying(true)).catch(() => setPlaying(false))
    else {
      el.pause()
      setPlaying(false)
    }
  }

  const footer = (left: ReactNode) => (
    <div className="answer-foot">
      {left}
      <span className="answer-quiet">{children}</span>
    </div>
  )

  if (phase === 'recording') {
    return (
      <div className="answer-panel">
        <div className="answer-live">
          <Ring seconds={recorder.seconds} target={target} />
          <div className="answer-meter">
            <span className="answer-status"><i className="rec-dot" aria-hidden="true" />Recording. Keep talking.</span>
            <MicBars levels={levels} />
            <span className="answer-note">Target {zoneText(target)}. Your words appear as text when you finish.</span>
          </div>
          <button type="button" className="btn finish" onClick={recorder.stop}>
            <i className="stop-mark" aria-hidden="true" />Finish answer
          </button>
        </div>
        {footer(<button type="button" className="btn ghost" onClick={startOver}>Start over</button>)}
      </div>
    )
  }

  if (phase === 'processing') {
    return (
      <div className="answer-panel" aria-busy={!failure}>
        <div className="answer-live">
          <Ring seconds={spoken} target={target} frozen />
          {failure ? (
            <div className="answer-meter">
              <span className="answer-status">Whisper could not write this down</span>
              <div className="error-box" role="alert">{failure}</div>
              <div className="row">
                {unwritten && <button type="button" className="btn primary" onClick={() => void transcribe(unwritten, generation.current)}>Try again</button>}
                <button type="button" className="btn" onClick={record}>Record again</button>
                <button type="button" className="btn ghost" onClick={typeInstead}>Type instead</button>
              </div>
            </div>
          ) : (
            <div className="answer-meter" role="status">
              <span className="answer-status">Turning your answer into text</span>
              <div className="mic-bars sweep" aria-hidden="true">
                {Array.from({ length: BARS }, (_, i) => <i key={i} style={{ animationDelay: `${-i * 0.06}s` }} />)}
              </div>
              <span className="answer-note">Whisper runs on this Mac. This usually takes 5 to 15 seconds.</span>
            </div>
          )}
        </div>
        {!failure && (
          <div className="text-forming" aria-hidden="true"><span /><span /><span /></div>
        )}
        {footer(!failure && <button type="button" className="btn ghost" onClick={record}>Cancel and record again</button>)}
      </div>
    )
  }

  if (phase === 'ready') {
    const zone = voice ? zoneOf(voice.seconds, target) : null
    return (
      <div className="answer-panel ready">
        <div className="answer-head">
          <label htmlFor="interview-answer">Your answer</label>
          {voice && zone && (
            <span className={`length-chip ${zone}`}>
              {clock(voice.seconds)}, {zone === 'good' ? 'in the green zone' : zone === 'short' ? 'a bit short' : 'a bit long'}
            </span>
          )}
          {voice && (
            <>
              <audio ref={audio} preload="none" src={`/api/speech/audio?id=${voice.audio}`} onEnded={() => setPlaying(false)} />
              <button type="button" className="btn hear" onClick={togglePlay} aria-pressed={playing}>
                {playing
                  ? <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z" /></svg>
                  : <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z" /></svg>}
                {playing ? 'Pause' : 'Hear my recording'}
              </button>
            </>
          )}
        </div>
        <textarea
          id="interview-answer"
          className="answer"
          rows={5}
          value={text}
          placeholder={voice ? '' : `Type your answer. Aim for what you would say in ${zoneText(target)}.`}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void send()
            }
          }}
        />
        {voice && <span className="answer-note">Whisper may mishear a word. Fix it here before you send.</span>}
        {recorder.error && <div className="error-box" role="alert">{recorder.error}</div>}
        {footer(
          <>
            <button type="button" className="btn primary wide" disabled={busy || text.trim() === ''} onClick={() => void send()}>Send answer</button>
            {speakable && <button type="button" className="btn outline" disabled={busy} onClick={record}>{voice ? 'Record again' : 'Speak instead'}</button>}
          </>,
        )}
      </div>
    )
  }

  return (
    <div className="answer-panel">
      <div className="answer-start">
        <button type="button" className="btn start-answer" onClick={record}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
          </svg>
          Start answering
        </button>
        <span className="answer-note">Aim for {zoneText(target)}. Press Finish answer when you are done.</span>
        {recorder.error && <div className="error-box" role="alert">{recorder.error}</div>}
      </div>
      {footer(<button type="button" className="btn ghost" onClick={typeInstead}>Type instead</button>)}
    </div>
  )
}
