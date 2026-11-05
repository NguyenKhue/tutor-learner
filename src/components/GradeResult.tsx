import { useState } from 'react'
import { clock, lengthNote } from '../lib/speakingTime'
import type { Attempt } from '../lib/types'
import { EnglishFeedback } from './EnglishFeedback'
import { SampleAnswer } from './SampleAnswer'

/** The fixed message shown for each failing attempt error code. */
const ERROR_TEXT: Record<'limit' | 'auth' | 'failed' | 'record', string> = {
  limit: 'Claude usage limit reached. Your answer is saved. Try again later.',
  auth: 'Claude is not logged in. Run claude in a terminal and log in, then press Grade again.',
  failed: 'Grading failed. Your answer is saved.',
  record: 'Could not save the result.',
}

/** What the result card needs to render and to act. */
interface Props {
  attempt: Attempt
  busy?: boolean
  /** The point's title, shown under the verdict. */
  title?: string
  onContinue(): void
  onRetry(): void
  onAppeal(reason: string): void
}

const STALLED_PENDING = { code: 'failed', message: 'not graded yet' } as const
const STALLED_GRADED = { code: 'record', message: 'not saved yet' } as const

/** The graded result card: the grade, mastery, English notes, saved answer on error, and the follow-up actions. */
export function GradeResult({ attempt, busy = false, title, onContinue, onRetry, onAppeal }: Props) {
  const [appealing, setAppealing] = useState(false)
  const [reason, setReason] = useState('')

  // An open attempt with no error (e.g. the server stopped mid-way) still needs a way forward.
  const err = attempt.error ?? (attempt.state === 'pending' ? STALLED_PENDING : attempt.state === 'graded' && attempt.grade?.ok ? STALLED_GRADED : undefined)
  const open = attempt.state === 'graded' && attempt.grade !== undefined && !attempt.grade.ok && !err

  const mastery = attempt.record && (
    <div className="mastery">
      <span className="mastery-line">
        <span className="grade-label">Mastery</span>
        <span className="mastery-pct mono">{Math.round(attempt.record.mastery * 100)}%</span>
      </span>
      <span className="mastery-bar" aria-hidden="true">
        <i style={{ width: `${Math.round(attempt.record.mastery * 100)}%` }} />
      </span>
      <span className="mastery-meta">
        <span>{attempt.record.status}</span>
        {attempt.record.next_review && <span>Next review: {attempt.record.next_review}</span>}
        {attempt.record.passed_gate && <span className="win">Mastered!</span>}
      </span>
    </div>
  )

  return (
    <>
      <section className="card grade" aria-label="Result">
        {attempt.grade && (
          <>
            <div className="verdict-head">
              <span className={`verdict-mark ${attempt.grade.ok ? 'ok' : 'no'}`} aria-hidden="true">
                {attempt.grade.ok ? '✓' : '✕'}
              </span>
              <div className="verdict-copy">
                <h1 className={`grade-big ${attempt.grade.ok ? 'ok' : 'no'}`}>{attempt.grade.ok ? 'Correct' : 'Not yet'}</h1>
                {title && <p className="verdict-point">{title}</p>}
              </div>
              {mastery}
            </div>
            <p className="why">{attempt.grade.why}</p>
            {attempt.grade.missing.length > 0 && (
              <div className="grade-block missing">
                <div className="grade-label">Add this next time</div>
                <ul>
                  {attempt.grade.missing.map((m) => <li key={m}>{m}</li>)}
                </ul>
              </div>
            )}
            <p className="grade-feedback">{attempt.grade.feedback}</p>
            {attempt.grade.sample && (
              <details className="more">
                <summary>A strong answer</summary>
                <SampleAnswer text={attempt.grade.sample} />
              </details>
            )}
          </>
        )}

        {!attempt.grade && mastery && <div className="verdict-head">{mastery}</div>}

        {err && (
          <div className="grade-block">
            <p className="grade-warn">
              {err === STALLED_PENDING ? 'Your answer is saved but not graded yet.' : err === STALLED_GRADED ? 'The result is not saved yet.' : ERROR_TEXT[err.code]}
            </p>
            <div className="row">
              <button type="button" className="btn primary" disabled={busy} onClick={onRetry}>
                {err.code === 'record' ? 'Save result' : 'Grade again'}
              </button>
            </div>
          </div>
        )}
        {err && !attempt.grade && (
          <div className="grade-block">
            <div className="grade-label">Your answer</div>
            <p className="saved">{attempt.answer}</p>
          </div>
        )}

        {open && (
          <div className="row">
            <button type="button" className="btn primary" disabled={busy} onClick={onContinue}>
              Continue
            </button>
            {!attempt.appealed && (
              <button type="button" className="btn" disabled={busy} onClick={() => setAppealing(true)}>
                I think this is right
              </button>
            )}
          </div>
        )}
        {open && appealing && (
          <div className="grade-block">
            <textarea
              className="answer"
              rows={3}
              aria-label="Why your answer is right"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="row">
              <button type="button" className="btn primary" disabled={busy || reason.trim() === ''} onClick={() => onAppeal(reason)}>
                Send
              </button>
            </div>
          </div>
        )}
      </section>

      {(attempt.english || attempt.voice) && (
        <details className="card english-card" open={!!attempt.english}>
          <summary>{attempt.english ? 'Your English' : 'Your recording'}</summary>
          {attempt.voice && (
            <div className="voice grade-block">
              <div className="grade-label">Your recording · {clock(attempt.voice.seconds)}, {lengthNote(attempt.voice.seconds)}</div>
              <audio controls preload="metadata" src={`/api/speech/audio?id=${attempt.voice.audio}`} />
            </div>
          )}
          <EnglishFeedback attempt={attempt} />
        </details>
      )}
    </>
  )
}
