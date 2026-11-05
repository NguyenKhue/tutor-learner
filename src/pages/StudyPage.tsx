import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { api } from '../api/client'
import { AnswerBox } from '../components/AnswerBox'
import { GradeResult } from '../components/GradeResult'
import { LessonView } from '../components/LessonView'
import { McqOptions } from '../components/McqOptions'
import { Steps } from '../components/Steps'
import { useHotkey } from '../hooks/useHotkey'
import { useTutorData } from '../hooks/useTutorData'
import { pointTitle } from '../lib/format'
import { todayRows } from '../lib/today'
import type { Attempt, Question, Voice } from '../lib/types'
import { Skeleton, Working } from '../components/Loading'

type Kind = 'review' | 'learn'

/** The steps of the study flow per point. */
type Step = 'load' | 'pretest' | 'lesson' | 'question' | 'result'

/** The error message of any thrown request failure. */
const asMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** The steps shown for each flow, and where the current step sits in them. */
function flowSteps(kind: Kind, step: Step): { items: string[]; at: number } {
  const items = kind === 'review' ? ['Answer', 'Result'] : ['Guess', 'Lesson', 'Answer', 'Result']
  const order: Step[] = kind === 'review' ? ['question', 'result'] : ['pretest', 'lesson', 'question', 'result']
  const at = order.indexOf(step)
  return { items, at: at < 0 ? 0 : at }
}

/** The small tag above the question, by its kind. */
const QUESTION_TAG: Record<Question['kind'], string> = {
  open: 'Open question',
  mcq: 'Multiple choice',
  pretest: 'Your guess',
}

/** The quiet line that says how to answer, by question kind. */
const QUESTION_HINT: Record<Question['kind'], string> = {
  open: 'Say it in your own words. Two or three ideas are enough.',
  mcq: 'Pick the one that fits.',
  pretest: 'Say what you think. It is fine to guess.',
}

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
  const [pretestVoice, setPretestVoice] = useState<Voice | null>(null)

  const [question, setQuestion] = useState<Question | null>(null)
  const [qLoading, setQLoading] = useState(false)
  const [textAnswer, setTextAnswer] = useState('')
  const [choice, setChoice] = useState<number | null>(null)
  const [showLesson, setShowLesson] = useState(false)
  const [voice, setVoice] = useState<Voice | null>(null)
  const [speechBusy, setSpeechBusy] = useState(false)

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
      setVoice(null)
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

  const speechHint = `${pointTitle(pointId)}. ${topic}`

  const canSubmit = question
    ? question.kind === 'mcq'
      ? choice !== null
      : textAnswer.trim() !== ''
    : false

  // runAttempt already stores the returned attempt; only move to the result step on success.
  const submit = () => {
    if (!question || !canSubmit || busy || speechBusy) return
    const answer = question.kind === 'mcq' ? String(choice) : textAnswer
    const spoken = question.kind !== 'mcq' && voice ? { voice } : {}
    void runAttempt('/api/answer', { point: pointId, q: question.q, kind, answer, ...spoken }).then((a) => {
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
    setVoice(null)
    setStep('question')
  }

  const rows = useMemo(() => (data ? todayRows(data) : []), [data])
  const place = rows.findIndex((r) => r.id === pointId)
  const nextRow = rows.find((r) => r.id !== pointId && !r.done)

  // The next Today item after this one, else back to the Today page.
  const goNext = useCallback(() => {
    if (step === 'result') navigate(nextRow?.href ?? '/')
  }, [nextRow, step, navigate])
  useHotkey('n', goNext)

  // Reload the shared data exactly once per recorded attempt.
  const reloaded = useRef<string | null>(null)
  useEffect(() => {
    if (attempt?.state === 'recorded' && reloaded.current !== attempt.id) {
      reloaded.current = attempt.id
      void reload()
    }
  }, [attempt, reload])

  const { items, at } = flowSteps(kind, step)
  const wide = step === 'question'
  const oneMoreOpen = point?.type === 'concept' && !!attempt && !!attempt.record && !attempt.record.passed_gate

  return (
    <div className={wide ? 'study-page study-wide' : 'study-page read-col'}>
      <div className="study-bar">
        <Link className="back" to="/">← Today</Link>
        {place >= 0 && <span className="hint">{`${place + 1} of ${rows.length}`}</span>}
      </div>

      {step !== 'load' && (
        <div className="study-top">
          <Steps items={items} at={at} />
          {step === 'question' && <span className="study-here">{pointTitle(pointId)}</span>}
        </div>
      )}

      {step !== 'question' && !(step === 'result' && attempt?.grade) && (
        <header className="study-head">
          <p>{topic}</p>
          <h1>{pointTitle(pointId)}</h1>
        </header>
      )}

      <div className="study">
        {(loadError || actionError) && (
          <div className="error-box" role="alert">{loadError ?? actionError}</div>
        )}

        {step === 'load' && <Skeleton />}

        {step === 'pretest' && (pretestQ ? (
          <section className="card step">
            <p className="prompt bigger">{pretestQ.prompt}</p>
            <AnswerBox ariaLabel="Your guess" value={pretestText} onChange={setPretestText} hint={speechHint} voice={pretestVoice} onVoice={setPretestVoice} onBusy={setSpeechBusy} target={false} />
            <div className="row">
              <button type="button" className="btn primary wide" disabled={busy || speechBusy || pretestText.trim() === ''} onClick={() => void checkPretest(pretestText)}>
                Check
              </button>
              <button type="button" className="btn ghost" disabled={busy || speechBusy} onClick={() => void checkPretest(null)}>
                I don't know yet
              </button>
            </div>
            {busy && pretestFeedback === null && <Working text="Checking your guess" />}
            {pretestFeedback !== null && (
              <>
                <p className="pretest-feedback">{pretestFeedback}</p>
                <div className="row">
                  <button type="button" className="btn primary wide" onClick={() => setStep('lesson')}>
                    Read the lesson
                  </button>
                </div>
              </>
            )}
          </section>
        ) : (
          <Skeleton />
        ))}

        {step === 'lesson' && (
          <>
            {pretestFeedback !== null && (
              <section className="card guess-recap" aria-label="Your guess">
                <span className="guess-label">Your guess</span>
                {pretestText.trim() !== ''
                  ? <p className="guess-said">{pretestText}</p>
                  : <p className="guess-said muted">You chose to skip the guess.</p>}
                <p className="guess-feedback">{pretestFeedback}</p>
              </section>
            )}
            <LessonView
              pointId={pointId}
              footer={
                <button type="button" className="btn primary wide" onClick={() => setStep('question')}>
                  Answer the question
                </button>
              }
            />
          </>
        )}

        {step === 'question' && (question ? (
          <>
            <section className="room question-room" aria-label="Question">
              <div className="question-kindline">
                <span className="tag question-tag">{QUESTION_TAG[question.kind]}</span>
                <span>{QUESTION_HINT[question.kind]}</span>
              </div>
              <p className="question-prompt">{question.prompt}</p>
            </section>
            <section className="card answer-card" aria-label="Your answer">
              <div className="answer-head">
                <span className="answer-label">Your answer</span>
              </div>
              {question.kind === 'mcq' ? (
                <McqOptions options={question.options ?? []} value={choice} onChange={setChoice} />
              ) : (
                <AnswerBox value={textAnswer} onChange={setTextAnswer} onSubmit={submit} hint={speechHint} voice={voice} onVoice={setVoice} onBusy={setSpeechBusy} />
              )}
              <div className="answer-actions">
                <button type="button" className="btn primary wide" disabled={!canSubmit || busy || speechBusy} onClick={submit}>
                  Submit
                </button>
                {question.kind === 'mcq' && <span className="kbd-hint">Press 1–4 to pick an answer.</span>}
                <span className="answer-quiet">
                  {kind === 'review' && (
                    <button type="button" className="btn ghost" onClick={() => setShowLesson((v) => !v)}>
                      {showLesson ? 'Hide lesson' : 'Show lesson'}
                    </button>
                  )}
                  <button type="button" className="btn ghost" disabled={busy} onClick={() => void regenerate()}>
                    New question
                  </button>
                </span>
              </div>
              {busy && !qLoading && <Working text="Grading your answer" />}
            </section>
            {qLoading && <Working text="Preparing questions" />}
            {kind === 'review' && showLesson && <LessonView pointId={pointId} />}
          </>
        ) : (
          <Working text="Preparing questions" />
        ))}

        {step === 'result' && attempt && (
          <GradeResult
            attempt={attempt}
            busy={busy}
            title={pointTitle(pointId)}
            onContinue={confirmIt}
            onRetry={retry}
            onAppeal={appeal}
          />
        )}
        {step === 'result' && attempt?.grade && !attempt.grade.ok && (
          <details className="more">
            <summary>Review the lesson</summary>
            <LessonView pointId={pointId} />
          </details>
        )}
        {step === 'result' && attempt && (attempt.state === 'recorded' || oneMoreOpen) && (
          <section className="room next-room" aria-labelledby="up-h">
            <div className="next-copy">
              <span className="room-eyebrow">{nextRow ? 'Up next' : 'Done for now'}</span>
              <h2 id="up-h">{nextRow ? nextRow.title : 'Back to Today'}</h2>
              {nextRow?.topic && <p className="next-topic">{nextRow.topic}</p>}
            </div>
            <div className="next-actions">
              {attempt.state === 'recorded' && (
                <button type="button" className="btn amber wide" onClick={goNext}>
                  {nextRow ? `Next: ${nextRow.title}` : 'Back to Today'} <kbd>n</kbd>
                </button>
              )}
              {oneMoreOpen && (
                <button type="button" className="btn on-dark" onClick={oneMore}>
                  One more question
                </button>
              )}
            </div>
          </section>
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
