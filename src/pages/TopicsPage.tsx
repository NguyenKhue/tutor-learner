import { Link } from 'react-router-dom'
import { useTutorData } from '../hooks/useTutorData'
import { nextInTopic, topicSummary } from '../lib/stats'
import { Skeleton } from '../components/Loading'

/** Topics: one row per topic with how far it has come and the next step in it. */
export function TopicsPage() {
  const { data } = useTutorData()
  if (!data) return <Skeleton />

  const points = data.export.points
  const rows = topicSummary(points, data.topicOrder)
  return (
    <>
      <header className="page-head">
        <h1>Topics</h1>
      </header>
      {rows.length === 0 && <p className="hint">No topics yet.</p>}
      <ul className="topic-list">
        {rows.map((r) => {
          const started = r.learning + r.mastered
          const next = nextInTopic(points, r.topic)
          return (
            <li key={r.topic} className="topic-row">
              <div className="row spread">
                <Link className="topic-name" to={`/topics/${encodeURIComponent(r.topic)}`}>{r.topic}</Link>
                <span className="hint">{`${started} of ${r.total} started · ${r.mastered} mastered`}</span>
              </div>
              <div className="topic-step">
                <div className="bar" aria-hidden="true"><i style={{ width: `${Math.round((started / r.total) * 100)}%` }} /></div>
                {next ? (
                  <Link className="action-link" to={next.href} aria-label={`${next.label} ${r.topic}`}>{next.label}</Link>
                ) : (
                  <span className="hint">Done</span>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </>
  )
}
