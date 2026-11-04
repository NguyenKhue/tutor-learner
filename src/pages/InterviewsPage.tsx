import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { Skeleton } from '../components/Loading'
import { ROUND_LABEL } from '../lib/interview'
import type { InterviewSession } from '../lib/types'

const LEVEL_LABEL = { mid: 'Mid', senior: 'Senior', lead: 'Lead' } as const

/** Past mock interviews, newest first, with the entry points to a new one and to weak spots. */
export function InterviewsPage() {
  const [sessions, setSessions] = useState<InterviewSession[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    api.get<InterviewSession[]>('/api/interviews').then(setSessions).catch(() => setFailed(true))
  }, [])

  return (
    <>
      <header className="page-head">
        <h1>Mock interview</h1>
        <p>Practice a full interview for a job, then see what to fix.</p>
      </header>
      <div className="row interview-actions">
        <Link className="btn primary wide" to="/interview/new">New mock interview</Link>
        <Link className="action-link" to="/interview/weak-spots">Weak spots</Link>
      </div>
      {failed && <p className="hint" role="alert">Could not load your interviews.</p>}
      {!sessions && !failed && <Skeleton />}
      {sessions && sessions.length === 0 && <p className="hint">No mock interviews yet.</p>}
      {sessions && sessions.length > 0 && (
        <ul className="topic-list interview-list">
          {sessions.map((s) => {
            const first = s.setup.source.trim().split('\n')[0]
            const rounds = s.setup.rounds.map((r) => ROUND_LABEL[r]).join(', ')
            return (
              <li key={s.id} className="topic-row">
                <div className="row spread">
                  <Link className="topic-name" to={`/interview/${encodeURIComponent(s.id)}`}>{first || 'No job description'}</Link>
                  {s.state === 'done' && s.report && (
                    <span className="hint">{s.report.levelMet ? 'Level met' : 'Level not met yet'}</span>
                  )}
                </div>
                <span className="hint">{s.created.slice(0, 10)}</span>
                <span className="hint">{`${LEVEL_LABEL[s.setup.level]} level`}</span>
                <span className="hint">{rounds}</span>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
