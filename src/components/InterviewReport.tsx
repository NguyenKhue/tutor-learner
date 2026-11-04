import { useState } from 'react'
import { Link } from 'react-router-dom'
import { InterviewAnswer } from './InterviewAnswer'
import { SampleAnswer } from './SampleAnswer'
import { Working } from './Loading'
import { targetFor, zoneOf, type Target } from '../lib/answerTime'
import { ROUND_LABEL } from '../lib/interview'
import { clock } from '../lib/speakingTime'
import type { InterviewSession, QuestionReport, Scores, Voice } from '../lib/types'

const SCORE_LABEL: Record<keyof Scores, string> = { reasoning: 'Reasoning', depth: 'Depth', structure: 'Structure', english: 'English', length: 'Length' }
const KEEP_DAYS = 30

interface Props {
  session: InterviewSession
  busy: boolean
  practice(q: string, text: string, voice: Voice | null): Promise<boolean>
  retry(): Promise<unknown>
}

const KEYS = Object.keys(SCORE_LABEL) as (keyof Scores)[]
const LEVEL_LABEL = { mid: 'Mid', senior: 'Senior', lead: 'Lead' } as const

/** A 1–4 score as four marks, filled up to the score. */
function Meter({ value }: { value: number }) {
  const whole = Math.round(value)
  return (
    <span className="meter" role="img" aria-label={`${whole} of 4`}>
      {[1, 2, 3, 4].map((n) => <i key={n} className={n <= whole ? 'on' : ''} />)}
    </span>
  )
}

function ScoreList({ scores }: { scores: Scores }) {
  return (
    <ul className="scores">
      {KEYS.map((k) => (
        <li key={k}><span>{SCORE_LABEL[k]}</span><Meter value={scores[k]} /></li>
      ))}
    </ul>
  )
}

/** The average of each score across the answered questions. */
function averages(questions: QuestionReport[]): Scores | null {
  if (questions.length === 0) return null
  const out = {} as Scores
  for (const k of KEYS) out[k] = questions.reduce((sum, q) => sum + q.scores[k], 0) / questions.length
  return out
}

function Review({ r }: { r: QuestionReport }) {
  return (
    <>
      <ScoreList scores={r.scores} />
      {r.missed.length > 0 && (
        <div className="grade-block">
          <div className="label">What was missing</div>
          <ul>{r.missed.map((m, i) => <li key={i}>{m}</li>)}</ul>
        </div>
      )}
      {r.sample.trim() && <details className="more"><summary>A strong answer</summary><SampleAnswer text={r.sample} /></details>}
      {r.englishNotes.length > 0 && (
        <details className="more"><summary>Your English</summary><ul>{r.englishNotes.map((n, i) => <li key={i}>{n}</li>)}</ul></details>
      )}
    </>
  )
}

/** The finished interview: verdict, fixes, each question's review with practice, and what to study next. */
export function InterviewReport({ session, busy, practice, retry }: Props) {
  const report = session.report
  const [open, setOpen] = useState<string | null>(null)
  if (!report) return null

  const expired = Date.now() - new Date(session.created).getTime() > KEEP_DAYS * 86_400_000
  const promptOf = (q: string) => session.plan?.flatMap((r) => r.questions).find((x) => x.q === q)?.prompt ?? q
  const send = async (q: string, text: string, voice: Voice | null) => {
    if (await practice(q, text, voice)) setOpen(null)
  }
  const lengthOf = (seconds: number, t: Target) => {
    const z = zoneOf(seconds, t)
    return `${clock(seconds)}, ${z === 'good' ? 'in the green zone' : z === 'short' ? 'a bit short' : 'a bit long'} (${clock(t[0])} to ${clock(t[1])})`
  }
  const lastErrored = session.practice.map((p) => Boolean(p.error)).lastIndexOf(true)
  const reviews = new Map(report.questions.map((r) => [r.q, r]))
  const overall = averages(report.questions)
  const level = LEVEL_LABEL[session.setup.level]
  const jd = session.setup.source.trim().split('\n')[0]
  const { notes, topics, gaps, drills, focus } = report.nextSteps

  return (
    <div className="debrief">
      <header className={report.levelMet ? 'verdict met' : 'verdict'}>
        <div className="verdict-text">
          <p className="verdict-level">{level} level{jd ? `, ${jd}` : ''}</p>
          <h1>{report.levelMet ? 'Level met' : 'Level not met yet'}</h1>
          <p className="verdict-summary">{report.summary}</p>
        </div>
        {overall && (
          <section className="overall" aria-label="Across your answers">
            <h2 className="label">Across your answers</h2>
            <ScoreList scores={overall} />
          </section>
        )}
      </header>

      {report.topFixes.length > 0 && (
        <section aria-label="Top fixes">
          <h2 className="section-title">Fix these first</h2>
          <ol className="fixes">
            {report.topFixes.map((f) => (
              <li key={f.title}>
                <h3>{f.title}</h3>
                {f.example && <blockquote className="said-quote">{f.example}</blockquote>}
                <p>{f.action}</p>
              </li>
            ))}
          </ol>
        </section>
      )}

      {session.plan?.map((round, ri) => {
        const qs = round.questions.filter((q) => reviews.has(q.q) || session.turns.some((t) => t.q === q.q && t.from === 'candidate'))
        if (qs.length === 0) return null
        return (
          <section key={ri} className="report-round">
            <h2 className="section-title"><span className="rounds-n">{ri + 1}</span>{ROUND_LABEL[round.kind]}</h2>
            {qs.map((pq) => {
              const target = targetFor(round.kind, pq)
              const answers = session.turns.filter((t) => t.q === pq.q && t.from === 'candidate')
              const review = reviews.get(pq.q)
              const tries = session.practice.filter((p) => p.q === pq.q)
              return (
                <article key={pq.q} className="card report-q">
                  <p className="report-asker">{round.persona.split(/[,.]/)[0].trim() || 'The interviewer'} asked</p>
                  <p className="said">{pq.prompt}</p>
                  {answers.map((a, i) => (
                    <div key={i} className="grade-block">
                      <div className="label">Your answer</div>
                      <p>{a.skipped ? 'Skipped' : a.text}</p>
                      {a.voice && (expired
                        ? <p className="hint">Recording removed after {KEEP_DAYS} days</p>
                        : <div className="voice-play"><audio controls preload="metadata" src={`/api/speech/audio?id=${a.voice.audio}`} /><span className="hint">{lengthOf(a.voice.seconds, target)}</span></div>)}
                    </div>
                  ))}
                  {review && <Review r={review} />}
                  {tries.map((p, i) => (
                    <div key={i} className="grade-block practice-result">
                      <div className="label">Your new answer</div>
                      <p>{p.answer}</p>
                      {p.result && <Review r={p.result} />}
                      {!p.result && !p.error && <Working text="Grading your new answer" />}
                      {p.error && (
                        <>
                          <p className="hint" role="alert">{p.error.message}</p>
                          {p === session.practice[lastErrored] && <button type="button" className="btn" disabled={busy} onClick={() => void retry()}>Try again</button>}
                        </>
                      )}
                    </div>
                  ))}
                  {open === pq.q ? (
                    <InterviewAnswer target={target} hint={pq.prompt} busy={busy} onSend={(text, voice) => send(pq.q, text, voice)}>
                      <button type="button" className="btn ghost" disabled={busy} onClick={() => setOpen(null)}>Cancel</button>
                    </InterviewAnswer>
                  ) : (
                    <div className="row"><button type="button" className="btn outline" disabled={busy} onClick={() => setOpen(pq.q)}>Practice again</button></div>
                  )}
                </article>
              )
            })}
          </section>
        )
      })}


      <section aria-label="Next steps">
        <h2 className="section-title">What to study next</h2>
        {focus && <p className="next-focus">{focus}</p>}
        <div className="next-grid">
          {(notes.length > 0 || topics.length > 0) && (
            <div>
              <h3 className="label">In your notes</h3>
              <ul className="next-steps">
                {notes.map((n) => <li key={n}><Link to={`/read/${encodeURIComponent(n)}`}>{n.split('/').pop()?.replace(/\.md$/, '')}</Link></li>)}
                {topics.map((t) => <li key={t}><Link to={`/topics/${encodeURIComponent(t)}`}>{t}</Link></li>)}
              </ul>
            </div>
          )}
          {gaps.length > 0 && (
            <div>
              <h3 className="label">Not in your notes yet</h3>
              <ul className="next-steps">
                {gaps.map((g) => <li key={g.url}><a href={g.url} target="_blank" rel="noreferrer">{g.topic}</a></li>)}
              </ul>
            </div>
          )}
          {drills.length > 0 && (
            <div>
              <h3 className="label">Say these out loud</h3>
              <ul className="next-steps">
                {drills.map((d) => <li key={d}>{d}</li>)}
              </ul>
            </div>
          )}
        </div>
      </section>
      <div className="reply-actions"><Link className="btn primary wide" to="/interview/new">New mock interview</Link><Link className="action-link" to="/interview">All interviews</Link></div>
    </div>
  )
}
