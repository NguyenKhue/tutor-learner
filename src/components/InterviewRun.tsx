import { useEffect, useRef, useState } from 'react'
import { AnswerBox } from './AnswerBox'
import { ROUND_LABEL } from '../lib/interview'
import { speak, speechAvailable, stopSpeaking } from '../lib/speak'
import type { InterviewSession, Voice } from '../lib/types'

interface Props {
  session: InterviewSession
  busy: boolean
  /** "Hide text until I answer" lives on the page so it stays on from question to question */
  hideText: boolean
  onHideText(hide: boolean): void
  /** posts to an action route; resolves when the session has been replaced */
  act(action: 'answer' | 'skip' | 'finish', extra?: Record<string, unknown>): Promise<void>
  onLeave(): void
}

/** The live interview: the interviewer's last turn, the answer box, and the three ways forward. */
export function InterviewRun({ session, busy, hideText, onHideText, act, onLeave }: Props) {
  const [text, setText] = useState('')
  const [voice, setVoice] = useState<Voice | null>(null)
  const [speechBusy, setSpeechBusy] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const spoken = useRef(-1)

  const lastIndex = session.turns.map((t) => t.from).lastIndexOf('interviewer')
  const last = lastIndex >= 0 ? session.turns[lastIndex] : null
  const answered = session.turns.some((t) => t.from === 'candidate' && !t.skipped)
  const canSpeak = speechAvailable()
  const hidden = hideText && canSpeak && !!session.current
  // The interview is over but the last turn is not the interviewer's: the old question must not stay next to Finish.
  const closing = !session.current && session.turns.at(-1)?.from !== 'interviewer'

  // A new interviewer turn is read aloud once; Play again repeats it.
  useEffect(() => {
    if (last && session.setup.readAloud && spoken.current !== lastIndex) speak(last.text)
    spoken.current = lastIndex
    setText('')
    setVoice(null)
  }, [lastIndex]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => stopSpeaking, [])

  const round = session.current ? session.plan?.[session.current.round] : undefined
  const qIndex = round && session.current ? round.questions.findIndex((q) => q.q === session.current?.q) : -1
  const where = round && qIndex >= 0 ? `${ROUND_LABEL[round.kind]} · question ${qIndex + 1} of ${round.questions.length}` : 'Interview'
  const jd = session.setup.source.trim().split('\n')[0]
  const hint = [round ? ROUND_LABEL[round.kind] : '', jd].filter(Boolean).join(' · ')

  const send = async () => {
    await act('answer', { text, ...(voice ? { voice } : {}) })
  }
  const end = async () => {
    setConfirming(false)
    if (answered) await act('finish')
    else onLeave()
  }

  return (
    <>
      <header className="page-head">
        <h1>{where}</h1>
      </header>
      {last && closing && (
        <section className="card interviewer" aria-label="Interviewer">
          <p className="prompt">That's the end of the interview.</p>
        </section>
      )}
      {last && !closing && (
        <section className="card interviewer" aria-label="Interviewer">
          {!hidden && last.text.split(/\n\s*\n/).map((p, i) => <p key={i} className="prompt">{p}</p>)}
          {hidden && <p className="hint">Text hidden. Listen, then answer.</p>}
          {canSpeak && (
            <div className="row">
              <button type="button" className="btn" onClick={() => speak(last.text)}>Play again</button>
              <label className="check-row">
                <input type="checkbox" checked={hideText} onChange={() => onHideText(!hideText)} />
                Hide text until I answer
              </label>
            </div>
          )}
        </section>
      )}
      {session.current ? (
        <section className="card step">
          <AnswerBox value={text} onChange={setText} hint={hint} voice={voice} onVoice={setVoice} onBusy={setSpeechBusy} />
          <div className="row">
            <button type="button" className="btn primary wide" disabled={busy || speechBusy || text.trim() === ''} onClick={() => void send()}>Send answer</button>
            <button type="button" className="btn" disabled={busy || speechBusy} onClick={() => void act('skip')}>Skip question</button>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => setConfirming(true)}>End interview</button>
          </div>
          {confirming && (
            <div className="row confirm" role="alertdialog" aria-label="End interview">
              <span>{answered ? 'End now and get your report?' : 'Nothing answered yet. Leave without a report?'}</span>
              <button type="button" className="btn primary" disabled={busy} onClick={() => void end()}>{answered ? 'End and get report' : 'Leave'}</button>
              <button type="button" className="btn ghost" onClick={() => setConfirming(false)}>Keep going</button>
            </div>
          )}
        </section>
      ) : (
        <div className="row">
          {answered
            ? <button type="button" className="btn primary wide" disabled={busy} onClick={() => void act('finish')}>Finish</button>
            : <button type="button" className="btn primary wide" onClick={onLeave}>Leave interview</button>}
        </div>
      )}
    </>
  )
}
