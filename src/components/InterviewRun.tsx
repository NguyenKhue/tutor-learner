import { useEffect, useRef, useState } from 'react'
import { InterviewAnswer, type AnswerPhase } from './InterviewAnswer'
import { Steps } from './Steps'
import { targetFor } from '../lib/answerTime'
import { ROUND_LABEL } from '../lib/interview'
import { onSpeaking, speak, speechAvailable, stopSpeaking } from '../lib/speak'
import type { InterviewSession } from '../lib/types'

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

/** The rounds of this interview in order, with the current one marked. */
function Rounds({ session }: { session: InterviewSession }) {
  const plan = session.plan ?? []
  const at = session.current ? session.current.round : plan.length
  return <Steps items={plan.map((r) => ROUND_LABEL[r.kind])} at={at} label="Rounds" />
}

/** The live interview: who is speaking and what they said, the answer box, and the ways forward. */
export function InterviewRun({ session, busy, hideText, onHideText, act, onLeave }: Props) {
  const [phase, setPhase] = useState<AnswerPhase>('idle')
  const [speaking, setSpeaking] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const spoken = useRef(-1)

  const lastIndex = session.turns.map((t) => t.from).lastIndexOf('interviewer')
  const last = lastIndex >= 0 ? session.turns[lastIndex] : null
  const answered = session.turns.some((t) => t.from === 'candidate' && !t.skipped)
  const canSpeak = speechAvailable()
  const hidden = hideText && canSpeak && !!session.current
  // The interview is over but the last turn is not the interviewer's: the old question must not stay next to Finish.
  const closing = !session.current && session.turns.at(-1)?.from !== 'interviewer'

  useEffect(() => onSpeaking(setSpeaking), [])
  // A new interviewer turn is read aloud once; Play again repeats it.
  useEffect(() => {
    if (last && session.setup.readAloud && spoken.current !== lastIndex) speak(last.text)
    spoken.current = lastIndex
  }, [lastIndex]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => stopSpeaking, [])

  const round = session.current ? session.plan?.[session.current.round] : undefined
  const qIndex = round && session.current ? round.questions.findIndex((q) => q.q === session.current?.q) : -1
  const jd = session.setup.source.trim().split('\n')[0]
  const hint = [round ? ROUND_LABEL[round.kind] : '', jd].filter(Boolean).join(', ')
  const paragraphs = closing ? ["That's the end of the interview."] : (last?.text.split(/\n\s*\n/) ?? [])
  const persona = round?.persona.split(/[,.]/)[0].trim()
  const role = round?.persona.includes(',') ? round.persona.slice(round.persona.indexOf(',') + 1).trim() : ''
  const question = round && session.current ? round.questions.find((q) => q.q === session.current?.q) : undefined
  const target = targetFor(round?.kind, question)
  const recording = phase === 'recording' || phase === 'processing'
  const status = speaking ? 'Speaking' : recording ? 'Listening' : ''
  const end = async () => {
    setConfirming(false)
    if (answered) await act('finish')
    else onLeave()
  }

  return (
    <div className="interview">
      <div className="interview-top">
        <Rounds session={session} />
        {jd && <span className="interview-job">{jd}</span>}
      </div>

      {last && (
        <section className={speaking ? 'stage speaking' : 'stage'} aria-label="Interviewer">
          <div className="stage-head">
            <span className="stage-avatar" aria-hidden="true">{(persona || 'I').charAt(0)}</span>
            <span className="stage-name">
              <span className="stage-who">{persona || 'Interviewer'}</span>
              {role && <span className="stage-role">{role}</span>}
            </span>
            {status && (
              <span className="stage-status" aria-live="polite">
                {speaking
                  ? <span className="voice-bars" aria-hidden="true"><i /><i /><i /><i /><i /></span>
                  : <i className="listen-dot" aria-hidden="true" />}
                {status}
              </span>
            )}
            {qIndex >= 0 && round && <span className="stage-where">Question {qIndex + 1} of {round.questions.length}</span>}
          </div>
          {hidden ? (
            <p className="stage-hidden">Text hidden. Listen, then answer.</p>
          ) : (
            <div className="stage-words">
              {paragraphs.map((p, i) => (
                <p key={i} className={i === paragraphs.length - 1 ? 'said' : 'said aside'}>{p}</p>
              ))}
            </div>
          )}
          {canSpeak && !closing && (
            <div className="stage-tools">
              <button type="button" className="btn on-dark" disabled={recording} onClick={() => speak(last.text)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M11 5 6 9H3v6h3l5 4z" />
                  <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />
                </svg>
                Play again
              </button>
              <label className="pill-toggle">
                <input type="checkbox" checked={hideText} onChange={() => onHideText(!hideText)} />
                Hide text until I answer
              </label>
            </div>
          )}
        </section>
      )}

      {session.current ? (
        <section className="reply" aria-label="Reply">
          <InterviewAnswer
            key={lastIndex}
            target={target}
            hint={hint}
            busy={busy}
            onPhase={setPhase}
            onSend={(text, voice) => act('answer', { text, ...(voice ? { voice } : {}) })}
          >
            <button type="button" className="btn ghost" disabled={busy || phase === 'processing'} onClick={() => void act('skip')}>Skip question</button>
            <button type="button" className="btn ghost" disabled={busy} onClick={() => setConfirming(true)}>End interview</button>
          </InterviewAnswer>
          {confirming && (
            <div className="row confirm" role="alertdialog" aria-label="End interview">
              <span>{answered ? 'End now and get your report?' : 'Nothing answered yet. Leave without a report?'}</span>
              <button type="button" className="btn primary" disabled={busy} onClick={() => void end()}>{answered ? 'End and get report' : 'Leave'}</button>
              <button type="button" className="btn ghost" onClick={() => setConfirming(false)}>Keep going</button>
            </div>
          )}
        </section>
      ) : (
        <div className="reply-actions">
          {answered
            ? <button type="button" className="btn primary wide" disabled={busy} onClick={() => void act('finish')}>Get my report</button>
            : <button type="button" className="btn primary wide" onClick={onLeave}>Leave interview</button>}
        </div>
      )}
    </div>
  )
}
