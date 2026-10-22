import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { AnswerBox } from '../components/AnswerBox'
import { GradeResult } from '../components/GradeResult'
import { LessonView } from '../components/LessonView'
import { McqOptions } from '../components/McqOptions'
import { useHotkey } from '../hooks/useHotkey'
import { useTutorData } from '../hooks/useTutorData'
import { pointTitle } from '../lib/format'
import { itemDone } from '../lib/today'
import type { Attempt, Point, Question } from '../lib/types'

type Kind = 'review' | 'learn'

/** The steps of the study flow per point. */
type Step = 'load' | 'pretest' | 'lesson' | 'question' | 'result'

/** The error message of any thrown request failure. */
const asMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** The study flow for one point: a small state machine over pretest → lesson → question → result. */
function Study({ pointId, kind }: { pointId: string; kind: Kind }) {
  const { data, reload } = useTutorData()
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>('load')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState<Attempt | null>(null)

  const [pretestQ, setPretestQ] = useState<Question | null>(null)
  const [pretestText, setPretestText] = useState('')
  const [pretestFeedback, setPretestFeedback] = useState<string | null>(null)

  const [question, setQuestion] = useState<Question | null>(null)
  const [qLoading, setQLoading] = useState(false)
  const [textAnswer, setTextAnswer] = useState('')
  const [choice, setChoice] = useState<number | null>(null)
  const [showLesson, setShowLesson] = useState(false)

  const point = data?.export.points.find((p) => p.id === pointId)
  const topic = point?.topic ?? (pointId.includes('/') ? pointId.slice(0, pointId.indexOf('/')) : pointId)

  // On load: resume the open attempt of this point, else route by kind.
  useEffect(() => {
    let on = true
    ;(async () => {
      try {
        const open = await api.get<Attempt[]>('/api/open-attempts')
        if (!on) return
        const mine = open.find((a) => a.point === pointId)
        if (mine) {
          setAttempt(mine)
          setStep('result')
        } else {
          setStep(kind === 'review' ? 'question' : 'pretest')
        }
      } catch (e) {
        if (on) setLoadError(asMsg(e))
      }
    })()
    return () => {
      on = false
    }
  }, [pointId, kind])

  // The pretest prompt comes from the point's question bank.
  useEffect(() => {
    if (step !== 'pretest') return
    let on = true
    ;(async () => {
      try {
        const bank = await api.get<{ questions: Question[] }>(`/api/bank?point=${encodeURIComponent(pointId)}`)
        if (!on) return
        const pre = bank.questions.find((q) => q.kind === 'pretest')
        if (pre) setPretestQ(pre)
        else setStep('lesson')
      } catch (e) {
        if (on) setLoadError(asMsg(e))
      }
    })()
    return () => {
      on = false
    }
  }, [step, pointId])

  const loadQuestion = useCallback(async () => {
    setQLoading(true)
    setActionError(null)
    try {
      const q = await api.get<Question>(`/api/question?point=${encodeURIComponent(pointId)}&kind=${kind}`)
      setQuestion(q)
      setTextAnswer('')
      setChoice(null)
    } catch (e) {
      setActionError(asMsg(e))
    } finally {
      setQLoading(false)
    }
  }, [pointId, kind])

  useEffect(() => {
    if (step === 'question') void loadQuestion()
  }, [step, loadQuestion])

  // A fresh attempt from the server; keeps the busy/alert handling in one place.
  const runAttempt = async (path: string, body: unknown): Promise<Attempt | null> => {
    setBusy(true)
    setActionError(null)
    try {
      const a = await api.post<Attempt>(path, body)
      setAttempt(a)
      return a
    } catch (e) {
      setActionError(asMsg(e))
      return null
    } finally {
      setBusy(false)
    }
  }

  const checkPretest = async (answer: string | null) => {
    setBusy(true)
    setActionError(null)
    try {
      const r = await api.post<{ feedback: string }>('/api/pretest', { point: pointId, answer })
      setPretestFeedback(r.feedback)
    } catch (e) {
      setActionError(asMsg(e))
    } finally {
      setBusy(false)
    }
  }

  const canSubmit = question
    ? question.kind === 'mcq'
      ? choice !== null
      : textAnswer.trim() !== ''
    : false

  // runAttempt already stores the returned attempt; only move to the result step on success.
  const submit = () => {
    if (!question || !canSubmit || busy) return
    const answer = question.kind === 'mcq' ? String(choice) : textAnswer
    void runAttempt('/api/answer', { point: pointId, q: question.q, kind, answer }).then((a) => {
      if (a) setStep('result')
    })
  }

  const retry = () => {
    if (attempt) void runAttempt('/api/attempt/retry', { id: attempt.id })
  }
  const confirmIt = () => {
    if (attempt) void runAttempt('/api/attempt/confirm', { id: attempt.id })
  }
  const appeal = (reason: string) => {
    if (attempt) void runAttempt('/api/attempt/appeal', { id: attempt.id, reason })
  }

  const regenerate = async () => {
    if (!window.confirm('Write new questions for this point?')) return
    setActionError(null)
    setBusy(true)
    try {
      await api.post('/api/bank/regenerate', { point: pointId })
      await loadQuestion()
    } catch (e) {
      setActionError(asMsg(e))
    } finally {
      setBusy(false)
    }
  }

  const oneMore = () => {
    setQuestion(null)
    setTextAnswer('')
    setChoice(null)
    setStep('question')
  }

  // The next Today item after this one, else back to the Today page.
  const goNext = useCallback(() => {
    if (step !== 'result') return
    if (!data) {
      navigate('/')
      return
    }
    const byId = new Map<string, Point>(data.export.points.map((p) => [p.id, p]))
    const notDone = (id: string) => {
      const p = byId.get(id)
      return !p || !itemDone(p, data.today)
    }
    const rows = [
      ...data.list.review.map((id) => ({ id, kind: 'review' as const })),
      ...data.list.fresh.map((id) => ({ id, kind: 'learn' as const })),
      ...data.list.extra.map((id) => {
        const p = byId.get(id)
        const due = !!p?.next_review && p.next_review <= data.today
        return { id, kind: due ? ('review' as const) : ('learn' as const) }
      }),
    ]
    const next = rows.find((r) => r.id !== pointId && notDone(r.id))
    navigate(next ? `/study/${encodeURIComponent(next.id)}?kind=${next.kind}` : '/')
  }, [data, pointId, step, navigate])
  useHotkey('n', goNext)

  // Reload the shared data exactly once per recorded attempt.
  const reloaded = useRef<string | null>(null)
  useEffect(() => {
    if (attempt?.state === 'recorded' && reloaded.current !== attempt.id) {
      reloaded.current = attempt.id
      void reload()
    }
  }, [attempt, reload])

  return (
    <div>
      <header className="page-head">
        <h1>{pointTitle(pointId)}</h1>
        <p>{topic}</p>
      </header>

      <div className="study">
        {(loadError || actionError) && (
          <div className="error-box" role="alert">{loadError ?? actionError}</div>
        )}

        {step === 'load' && <p className="hint">Loading…</p>}

        {step === 'pretest' && (pretestQ ? (
          <section className="card step">
            <p className="prompt">{pretestQ.prompt}</p>
            <AnswerBox ariaLabel="Your guess" value={pretestText} onChange={setPretestText} />
            <div className="row">
              <button type="button" className="btn primary" disabled={busy || pretestText.trim() === ''} onClick={() => void checkPretest(pretestText)}>
                Check
              </button>
              <button type="button" className="btn" disabled={busy} onClick={() => void checkPretest(null)}>
                I don't know yet
              </button>
            </div>
            {busy && pretestFeedback === null && <p className="hint">Checking…</p>}
            {pretestFeedback !== null && (
              <>
                <p className="pretest-feedback">{pretestFeedback}</p>
                <div className="row">
                  <button type="button" className="btn primary" onClick={() => setStep('lesson')}>
                    Read the lesson
                  </button>
                </div>
              </>
            )}
          </section>
        ) : (
          <p className="hint">Loading…</p>
        ))}

        {step === 'lesson' && (
          <LessonView
            pointId={pointId}
            footer={
              <button type="button" className="btn primary" onClick={() => setStep('question')}>
                Answer the question
              </button>
            }
          />
        )}

        {step === 'question' && (question ? (
          <section className="card step">
            <p className="prompt">{question.prompt}</p>
            {question.kind === 'mcq' ? (
              <McqOptions options={question.options ?? []} value={choice} onChange={setChoice} />
            ) : (
              <AnswerBox value={textAnswer} onChange={setTextAnswer} onSubmit={submit} />
            )}
            <div className="row">
              <button type="button" className="btn primary" disabled={!canSubmit || busy} onClick={submit}>
                Submit
              </button>
              <span className="kbd-hint">
                {question.kind === 'mcq' ? 'Press 1–4 to pick an answer.' : '⌘↩ to submit'}
              </span>
            </div>
            {busy && !qLoading && <p className="hint">Grading…</p>}
            <div className="row spread">
              {kind === 'review' ? (
                <button type="button" className="btn ghost" onClick={() => setShowLesson((v) => !v)}>
                  {showLesson ? 'Hide lesson' : 'Show lesson'}
                </button>
              ) : (
                <span />
              )}
              <button type="button" className="btn ghost" disabled={busy} onClick={() => void regenerate()}>
                Regenerate questions
              </button>
            </div>
            {qLoading && <p className="hint">Preparing questions…</p>}
            {kind === 'review' && showLesson && <LessonView pointId={pointId} />}
          </section>
        ) : (
          <p className="hint">Preparing questions…</p>
        ))}

        {step === 'result' && attempt && (
          <GradeResult
            attempt={attempt}
            busy={busy}
            onContinue={confirmIt}
            onRetry={retry}
            onAppeal={appeal}
          />
        )}
        {step === 'result' && attempt?.grade && !attempt.grade.ok && <LessonView pointId={pointId} />}
        {step === 'result' && attempt && (
          <div className="study-foot">
            {point?.type === 'concept' && attempt.record && !attempt.record.passed_gate && (
              <button type="button" className="btn" onClick={oneMore}>
                One more question
              </button>
            )}
            <button type="button" className="btn primary" aria-label="Next" onClick={goNext}>
              Next <kbd>n</kbd>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/** The Study page: reads the route params and remounts the flow per point and kind. */
export function StudyPage() {
  const params = useParams()
  const pointId = params.pointId ?? ''
  const [search] = useSearchParams()
  const kind = search.get('kind') === 'review' ? ('review' as const) : ('learn' as const)
  return <Study key={`${pointId}|${kind}`} pointId={pointId} kind={kind} />
}
