import { Link, useParams } from 'react-router-dom'
import { useTutorData } from '../hooks/useTutorData'
import { pointTitle } from '../lib/format'

/** Topic: the points of one topic, listed in their order within the vault. */
export function TopicPage() {
  const { topic = '' } = useParams()
  const { data } = useTutorData()
  if (!data) return <p className="hint">Loading…</p>

  const points = data.export.points
    .filter((p) => p.topic === topic)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
  return (
    <>
      <header className="page-head">
        <h1>{topic || 'Topic'}</h1>
        <p>
          {points.length} {points.length === 1 ? 'point' : 'points'}, in vault order.
        </p>
      </header>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Point</th>
              <th>Status</th>
              <th>Mastery</th>
              <th>Next review</th>
            </tr>
          </thead>
          <tbody>
            {points.map((p) => (
              <tr key={p.id}>
                <td>
                  <Link to={'/point/' + encodeURIComponent(p.id)}>{pointTitle(p.id)}</Link>
                </td>
                <td>
                  <span className={'tag ' + p.status}>{p.status}</span>
                </td>
                <td className="num">{Math.round(p.mastery * 100)}%</td>
                <td className="num">{p.next_review ?? '—'}</td>
              </tr>
            ))}
            {points.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  No points in this topic yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
