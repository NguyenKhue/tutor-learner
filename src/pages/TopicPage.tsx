import { Link, useParams } from 'react-router-dom'
import { useTutorData } from '../hooks/useTutorData'
import { STATUS_LABEL, pointTitle } from '../lib/format'
import { Skeleton } from '../components/Loading'

/** Topic: the points of one topic, listed in their order within the vault. */
export function TopicPage() {
  const { topic = '' } = useParams()
  const { data } = useTutorData()
  if (!data) return <Skeleton />

  const points = data.export.points
    .filter((p) => p.topic === topic)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
  return (
    <>
      <Link className="back page-back" to="/topics">← Topics</Link>
      <header className="page-head">
        <h1>{topic || 'Topic'}</h1>
        <p>{points.length} {points.length === 1 ? 'point' : 'points'}</p>
      </header>
      {points.length === 0 ? (
        <p className="hint">No points in this topic yet.</p>
      ) : (
        <ul className="queue">
          {points.map((p) => (
            <li key={p.id} className="queue-item">
              <Link to={'/point/' + encodeURIComponent(p.id)}>{pointTitle(p.id)}</Link>
              <span className="hint">{STATUS_LABEL[p.status]}</span>
              <span className="hint point-pct">{Math.round(p.mastery * 100)}%</span>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
