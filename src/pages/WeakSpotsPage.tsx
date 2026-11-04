import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { Skeleton } from '../components/Loading'
import type { WeakSpotSummary } from '../lib/types'

const KIND_LABEL = { content: 'Content', level: 'Level', english: 'English', delivery: 'Delivery' } as const

/** Patterns that repeat across finished interviews, with whether each one is getting better. */
export function WeakSpotsPage() {
  const [spots, setSpots] = useState<WeakSpotSummary[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    api.get<WeakSpotSummary[]>('/api/interview/weak-spots').then(setSpots).catch(() => setFailed(true))
  }, [])

  return (
    <>
      <Link className="page-back" to="/interview">← Mock interview</Link>
      <header className="page-head">
        <h1>Weak spots</h1>
        <p>What keeps coming up across your interviews.</p>
      </header>
      {failed && <p className="hint" role="alert">Could not load weak spots.</p>}
      {!spots && !failed && <Skeleton />}
      {spots && spots.length === 0 && <p className="hint">Do two interviews to see patterns.</p>}
      {spots && spots.length > 0 && (
        <ul className="spot-list">
          {spots.map((s) => (
            <li key={s.key} className="spot-card">
              <div className="row spread">
                <span className="spot-label">{s.label}</span>
                <span className={`trend ${s.trend}`}>{s.trend === 'improving' ? 'Improving' : 'Still there'}</span>
              </div>
              <span className="interview-row-meta">
                <span>{KIND_LABEL[s.kind]}</span>
                <span>Seen in {s.sessions} interviews</span>
                <span>Last seen {s.lastSeen.slice(0, 10)}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
