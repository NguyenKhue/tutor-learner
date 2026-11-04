import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { Skeleton } from '../components/Loading'
import { ROUND_LABEL } from '../lib/interview'
import type { InterviewSession, Scores, WeakSpotSummary } from '../lib/types'

const LEVEL_LABEL = { mid: 'Mid', senior: 'Senior', lead: 'Lead' } as const
const SHOWN_SPOTS = 3

const BAR_KEYS: (keyof Scores)[] = ['reasoning', 'depth', 'structure', 'english']

/** A small picture of a session: a live dot while it runs, else four bars for its average scores. */
function Badge({ s }: { s: InterviewSession }) {
  const qs = s.report?.questions ?? []
  if (s.state !== 'done' || qs.length === 0) return <span className={s.state !== 'done' ? 'row-badge live' : 'row-badge'} aria-hidden="true"><i /></span>
  const avg = (k: keyof Scores) => qs.reduce((n, q) => n + q.scores[k], 0) / qs.length
  return (
    <span className={`row-badge bars ${s.report?.levelMet ? 'met' : ''}`} aria-hidden="true">
      {BAR_KEYS.map((k) => <i key={k} style={{ height: `${Math.round(avg(k) * 7)}px` }} />)}
    </span>
  )
}

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })

/** Past mock interviews, newest first, with the entry point to a new one and the weak spots that keep coming back. */
export function InterviewsPage() {
  const [sessions, setSessions] = useState<InterviewSession[] | null>(null)
  const [spots, setSpots] = useState<WeakSpotSummary[]>([])
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    api.get<InterviewSession[]>('/api/interviews').then(setSessions).catch(() => setFailed(true))
    api.get<WeakSpotSummary[]>('/api/interview/weak-spots').then(setSpots).catch(() => setSpots([]))
  }, [])

  return (
    <>
      <header className="page-head interviews-head">
        <div>
          <h1>Your interviews</h1>
          <p>Practice from a real job post. Each one ends with a debrief.</p>
        </div>
        <Link className="btn primary wide new-interview" to="/interview/new">
          <span className="plus" aria-hidden="true">+</span>New mock interview
        </Link>
      </header>
      <div className="interviews">
        <div className="interviews-main">
          {failed && <p className="hint" role="alert">Could not load your interviews.</p>}
          {!sessions && !failed && <Skeleton />}
          {sessions && sessions.length === 0 && <p className="hint">No mock interviews yet.</p>}
          {sessions && sessions.length > 0 && (
            <ul className="interview-list">
              {sessions.map((s) => {
                const first = s.setup.source.trim().split('\n')[0]
                const rounds = s.setup.rounds.map((r) => ROUND_LABEL[r]).join(', ')
                const status = s.state !== 'done' ? 'open' : s.report?.levelMet ? 'met' : 'not-met'
                return (
                  <li key={s.id} className="interview-row">
                    <Badge s={s} />
                    <span className="interview-row-text">
                      <Link className="interview-row-title" to={`/interview/${encodeURIComponent(s.id)}`}>{first || 'No job description'}</Link>
                      <span className="interview-row-meta">
                        <span>{day(s.created)}</span>
                        <span>{`${LEVEL_LABEL[s.setup.level]} level`}</span>
                        <span>{rounds}</span>
                      </span>
                    </span>
                    <span className={`status ${status}`}>
                      {status === 'open' ? 'In progress' : status === 'met' ? 'Level met' : 'Level not met yet'}
                    </span>
                    <span className="row-go" aria-hidden="true">{status === 'open' ? 'Continue' : 'Debrief'}</span>
                  </li>
                )
              })}
            </ul>
          )}
          <p className="hint keep-note">Interviews are kept for 30 days.</p>
        </div>
        <aside className="spots-aside" aria-label="Weak spots">
          <h2>Weak spots</h2>
          {spots.length === 0 ? (
            <p className="spots-empty">Patterns that come back in more than one interview show up here.</p>
          ) : (
            <>
              <p className="spots-empty">Patterns that came back in more than one interview.</p>
              <div className="spots">
                {spots.slice(0, SHOWN_SPOTS).map((s) => (
                  <div key={s.key} className="spot">
                    <span className="spot-label">{s.label}</span>
                    <span className={`trend ${s.trend}`}>{s.trend === 'improving' ? 'Improving' : 'Still there'}</span>
                    <span className="spot-meta">Seen in {s.sessions} interviews</span>
                  </div>
                ))}
              </div>
            </>
          )}
          <Link className="spots-link" to="/interview/weak-spots">See all weak spots</Link>
        </aside>
      </div>
    </>
  )
}
