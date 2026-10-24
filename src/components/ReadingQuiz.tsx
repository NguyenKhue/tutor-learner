import { useState } from 'react'
import { api, ApiError } from '../api/client'
import type { ReadingCheck, ReadingQuiz as Quiz } from '../lib/types'

const ERROR_TEXT: Record<string, string> = {
  limit: 'Claude usage limit reached. Your answers are saved. Try again later.',
  auth: 'Claude is not logged in. Run claude in a terminal and log in, then press Grade again.',
  failed: 'Grading failed. Your answers are saved.',
}

/** The quiz after reading a note: three written answers, one grade, then the result with appeal and retry. */
export function ReadingQuiz({ path, quiz, initial, onGraded }: { path: string; quiz: Quiz; initial: ReadingCheck | null; onGraded: () => void }) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [check, setCheck] = useState<ReadingCheck | null>(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [appealing, setAppealing] = useState(false)
  const [reason, setReason] = useState('')

  const run = async (call: () => Promise<ReadingCheck>) => {
    setBusy(true)
    setError(null)
    try {
      const next = await call()
      setCheck(next)
      setAppealing(false)
      if (next.state === 'graded') onGraded()
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const ready = quiz.questions.every((q) => (answers[q.q] ?? '').trim())
  const submit = () => run(() => api.post<ReadingCheck>('/api/reading/check', { path, answers }))
  const retry = () => run(() => api.post<ReadingCheck>('/api/reading/check/retry', { path, id: check!.id }))
  const appeal = () => run(() => api.post<ReadingCheck>('/api/reading/check/appeal', { path, id: check!.id, reason }))

  if (!check) {
    return (
      <section className="card quiz" aria-label="Quiz">
        {error && <div className="error-box" role="alert">{error}</div>}
        {quiz.questions.map((q) => (
          <div className="field" key={q.q}>
            <label htmlFor={`a-${q.q}`}>{q.prompt}</label>
            <textarea
              id={`a-${q.q}`}
              className="answer"
              rows={4}
              value={answers[q.q] ?? ''}
              onChange={(e) => setAnswers({ ...answers, [q.q]: e.target.value })}
            />
          </div>
        ))}
        <div className="row">
          <button type="button" className="btn primary" disabled={!ready || busy} onClick={() => void submit()}>
            Submit
          </button>
          {busy && <span className="hint">Grading…</span>}
        </div>
      </section>
    )
  }

  const byQ = new Map((check.results ?? []).map((r) => [r.q, r]))
  return (
    <section className="card quiz" aria-label="Quiz result">
      {error && <div className="error-box" role="alert">{error}</div>}
      {check.state === 'graded' ? (
        <div className={`grade-big ${check.passed ? 'ok' : 'no'}`}>{check.passed ? 'Passed' : 'Read again in 2 days'}</div>
      ) : (
        <div className="grade-block">
          <p className="grade-warn">{ERROR_TEXT[check.error?.code ?? 'failed'] ?? ERROR_TEXT.failed}</p>
          <button type="button" className="btn primary" disabled={busy} onClick={() => void retry()}>
            Grade again
          </button>
        </div>
      )}
      {quiz.questions.map((q) => {
        const r = byQ.get(q.q)
        const english = check.english?.[q.q]
        return (
          <div className="grade-block" key={q.q}>
            <div className="grade-label">{q.prompt}</div>
            <p className="saved">{check.answers[q.q]}</p>
            {r && (
              <>
                <p className={r.ok ? 'ok-line' : 'no-line'}>{r.ok ? 'Correct' : 'Not yet'}: {r.why}</p>
                {r.missing.length > 0 && (
                  <ul>
                    {r.missing.map((m) => <li key={m}>{m}</li>)}
                  </ul>
                )}
                <p className="grade-feedback">{r.feedback}</p>
              </>
            )}
            {english && (
              <div className="english">
                <div className="eng-row"><span className="grade-label">Better</span><span>{english.corrected}</span></div>
                {english.notes.length > 0 && <ul>{english.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
              </div>
            )}
          </div>
        )
      })}
      {check.state === 'graded' && check.passed === false && !check.appealed && (
        <div className="grade-block">
          {appealing ? (
            <>
              <label htmlFor="appeal">Why your answers are right</label>
              <textarea id="appeal" className="answer" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
              <button type="button" className="btn" disabled={busy || !reason.trim()} onClick={() => void appeal()}>
                Send
              </button>
            </>
          ) : (
            <button type="button" className="btn" disabled={busy} onClick={() => setAppealing(true)}>
              I think this is right
            </button>
          )}
        </div>
      )}
    </section>
  )
}
