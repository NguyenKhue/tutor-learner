import { useState } from 'react'
import type { Attempt } from '../lib/types'
import { EnglishFeedback } from './EnglishFeedback'

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
  onContinue(): void
  onRetry(): void
  onAppeal(reason: string): void
}

/** The graded result card: the grade, mastery, English notes, saved answer on error, and the follow-up actions. */
export function GradeResult({ attempt, busy = false, onContinue, onRetry, onAppeal }: Props) {
  const [appealing, setAppealing] = useState(false)
  const [reason, setReason] = useState('')

  const err = attempt.error
  const open = attempt.state === 'graded' && attempt.grade !== undefined && !attempt.grade.ok && !err

  return (
    <section className="card grade">
      {attempt.grade && (
        <>
          <div className={`grade-big ${attempt.grade.ok ? 'ok' : 'no'}`}>
            {attempt.grade.ok ? 'Correct' : 'Not yet'}
          </div>
          <p className="why">{attempt.grade.why}</p>
          {attempt.grade.missing.length > 0 && (
            <div className="grade-block">
              <div className="grade-label">Missing:</div>
              <ul>
                {attempt.grade.missing.map((m) => <li key={m}>{m}</li>)}
              </ul>
            </div>
          )}
          <p className="grade-feedback">{attempt.grade.feedback}</p>
        </>
      )}

      {attempt.record && (
        <div className="mastery">
          <span className="grade-label">Mastery</span>
          <span className="mastery-pct mono">{Math.round(attempt.record.mastery * 100)}%</span>
          <span>{attempt.record.status}</span>
          {attempt.record.next_review && <span>Next review: {attempt.record.next_review}</span>}
          {attempt.record.passed_gate && <span className="win">Mastered!</span>}
        </div>
      )}

      <EnglishFeedback attempt={attempt} />

      {err && (
        <div className="grade-block">
          <p className="grade-warn">{ERROR_TEXT[err.code]}</p>
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
  )
}
