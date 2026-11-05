import { Link } from 'react-router-dom'
import { useTutorData } from '../hooks/useTutorData'
import { nextInTopic, topicSummary } from '../lib/stats'
import { Skeleton } from '../components/Loading'

/** Topics: a grid of cards with how far each topic has come and the next step in it. */
export function TopicsPage() {
  const { data } = useTutorData()
  if (!data) return <Skeleton />

  const points = data.export.points
  const rows = topicSummary(points, data.topicOrder)
  return (
    <>
      <header className="page-head topics-head">
        <div>
          <h1>Topics</h1>
          <p>Every point you study, grouped the way an interview asks about them.</p>
        </div>
        <p className="topic-legend-line">
          <span><i className="legend-mastered" aria-hidden="true" />Mastered</span>
          <span><i className="legend-learning" aria-hidden="true" />Learning</span>
          <span><i className="legend-rest" aria-hidden="true" />Not started</span>
        </p>
      </header>
      {rows.length === 0 && <p className="hint">No topics yet.</p>}
      <div className="work topics-page">
        <ul className="topic-grid">
          {rows.map((r) => {
            const started = r.learning + r.mastered
            const next = nextInTopic(points, r.topic)
            const done = r.mastered === r.total
            return (
              <li key={r.topic} className={done ? 'topic-card done' : 'topic-card'}>
                <Link className="topic-name" to={`/topics/${encodeURIComponent(r.topic)}`}>{r.topic}</Link>
                <span className="topic-track" aria-hidden="true">
                  <i className="mastered" style={{ width: `${(r.mastered / r.total) * 100}%` }} />
                  <i className="learning" style={{ width: `${(r.learning / r.total) * 100}%` }} />
                </span>
                <span className="topic-count">{`${started} of ${r.total} started · ${r.mastered} mastered`}</span>
                {next ? (
                  <Link className="action-link" to={next.href} aria-label={`${next.label} ${r.topic}`}>{next.label}</Link>
                ) : (
                  <span className="hint">Done</span>
                )}
              </li>
            )
          })}
        </ul>
      </div>
    </>
  )
}
