import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AnswerBox } from './AnswerBox'
import { SampleAnswer } from './SampleAnswer'
import { Working } from './Loading'
import { ROUND_LABEL } from '../lib/interview'
import { clock, lengthNote } from '../lib/speakingTime'
import type { InterviewSession, QuestionReport, Scores, Voice } from '../lib/types'

const SCORE_LABEL: Record<keyof Scores, string> = { reasoning: 'Reasoning', depth: 'Depth', structure: 'Structure', english: 'English', length: 'Length' }
const KEEP_DAYS = 30

interface Props {
  session: InterviewSession
  busy: boolean
  practice(q: string, text: string, voice: Voice | null): Promise<void>
  retry(): Promise<void>
}

function ScoreList({ scores }: { scores: Scores }) {
  return (
    <ul className="scores">
      {(Object.keys(SCORE_LABEL) as (keyof Scores)[]).map((k) => (
        <li key={k}><span>{SCORE_LABEL[k]}</span> <b className="mono">{scores[k]}/5</b></li>
      ))}
    </ul>
  )
}

function Review({ r }: { r: QuestionReport }) {
  return (
    <>
      <ScoreList scores={r.scores} />
      {r.missed.length > 0 && (
        <div className="grade-block">
          <div className="grade-label">You missed</div>
          <ul>{r.missed.map((m) => <li key={m}>{m}</li>)}</ul>
        </div>
      )}
      {r.sample.trim() && <details className="more"><summary>A strong answer</summary><SampleAnswer text={r.sample} /></details>}
      {r.englishNotes.length > 0 && (
        <details className="more"><summary>Your English</summary><ul>{r.englishNotes.map((n) => <li key={n}>{n}</li>)}</ul></details>
      )}
    </>
  )
}

/** The finished interview: verdict, fixes, each question's review with practice, and what to study next. */
export function InterviewReport({ session, busy, practice, retry }: Props) {
  const report = session.report
  const [open, setOpen] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [voice, setVoice] = useState<Voice | null>(null)
  const [speechBusy, setSpeechBusy] = useState(false)
  if (!report) return null

  const expired = Date.now() - new Date(session.created).getTime() > KEEP_DAYS * 86_400_000
  const promptOf = (q: string) => session.plan?.flatMap((r) => r.questions).find((x) => x.q === q)?.prompt ?? q
  const send = async (q: string) => {
    await practice(q, text, voice)
    setOpen(null)
    setText('')
    setVoice(null)
  }
  const reviews = new Map(report.questions.map((r) => [r.q, r]))
  const lastPracticeFailed = session.practice.at(-1)?.error

  return (
    <>
      <header className="page-head">
        <h1>{report.levelMet ? 'Level met' : 'Level not met yet'}</h1>
        <p>{report.summary}</p>
      </header>

      {report.topFixes.length > 0 && (
        <section className="card" aria-label="Top fixes">
          <div className="grade-label">Fix these first</div>
          {report.topFixes.map((f) => (
            <div key={f.title} className="grade-block">
              <h3>{f.title}</h3>
              <p className="hint">{f.example}</p>
              <p>{f.action}</p>
            </div>
          ))}
        </section>
      )}

      {session.plan?.map((round, ri) => {
        const qs = round.questions.filter((q) => reviews.has(q.q) || session.turns.some((t) => t.q === q.q && t.from === 'candidate'))
        if (qs.length === 0) return null
        return (
          <section key={ri} className="report-round">
            <h2>{ROUND_LABEL[round.kind]}</h2>
            {qs.map((pq) => {
              const answers = session.turns.filter((t) => t.q === pq.q && t.from === 'candidate')
              const review = reviews.get(pq.q)
              const tries = session.practice.filter((p) => p.q === pq.q)
              return (
                <article key={pq.q} className="card report-q">
                  <p className="prompt">{pq.prompt}</p>
                  {answers.map((a, i) => (
                    <div key={i} className="grade-block">
                      <div className="grade-label">Your answer</div>
                      <p>{a.skipped ? 'Skipped' : a.text}</p>
                      {a.voice && (expired
                        ? <p className="hint">Recording removed after {KEEP_DAYS} days</p>
                        : <div className="voice-play"><audio controls preload="metadata" src={`/api/speech/audio?id=${a.voice.audio}`} /><span className="hint">{clock(a.voice.seconds)} · {lengthNote(a.voice.seconds)}</span></div>)}
                    </div>
                  ))}
                  {review && <Review r={review} />}
                  {tries.map((p, i) => (
                    <div key={i} className="grade-block practice-result">
                      <div className="grade-label">Your new answer</div>
                      <p>{p.answer}</p>
                      {p.result && <Review r={p.result} />}
                      {p.error && <p className="hint" role="alert">{p.error.message}</p>}
                    </div>
                  ))}
                  {open === pq.q ? (
                    <>
                      <AnswerBox value={text} onChange={setText} hint={pq.prompt} voice={voice} onVoice={setVoice} onBusy={setSpeechBusy} />
                      <div className="row">
                        <button type="button" className="btn primary" disabled={busy || speechBusy || text.trim() === ''} onClick={() => void send(pq.q)}>Send answer</button>
                        <button type="button" className="btn ghost" disabled={busy} onClick={() => setOpen(null)}>Cancel</button>
                      </div>
                    </>
                  ) : (
                    <div className="row"><button type="button" className="btn" disabled={busy} onClick={() => { setOpen(pq.q); setText(''); setVoice(null) }}>Practice again</button></div>
                  )}
                </article>
              )
            })}
          </section>
        )
      })}

      {busy && <Working text="Grading your new answer" />}
      {lastPracticeFailed && !busy && <button type="button" className="btn" onClick={() => void retry()}>Try again</button>}

      <section className="card" aria-label="Next steps">
        <div className="grade-label">What to study next</div>
        {report.nextSteps.focus && <p>{report.nextSteps.focus}</p>}
        <ul className="next-steps">
          {report.nextSteps.notes.map((n) => <li key={n}><Link to={`/read/${encodeURIComponent(n)}`}>{n.split('/').pop()?.replace(/\.md$/, '')}</Link></li>)}
          {report.nextSteps.topics.map((t) => <li key={t}><Link to={`/topics/${encodeURIComponent(t)}`}>{t}</Link></li>)}
          {report.nextSteps.gaps.map((g) => <li key={g.url}><a href={g.url} target="_blank" rel="noreferrer">{g.topic}</a></li>)}
          {report.nextSteps.drills.map((d) => <li key={d}>{d}</li>)}
        </ul>
      </section>
      <div className="row"><Link className="btn primary wide" to="/interview/new">New mock interview</Link><Link className="action-link" to="/interview">All interviews</Link></div>
    </>
  )
}
