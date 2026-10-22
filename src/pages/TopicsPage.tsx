import { Link } from 'react-router-dom'
import { useTutorData } from '../hooks/useTutorData'
import { topicSummary } from '../lib/stats'

/** Topics: one row per topic with its status counts and a small mastered progress bar. */
export function TopicsPage() {
  const { data } = useTutorData()
  if (!data) return <p className="hint">Loading…</p>

  const rows = topicSummary(data.export.points, data.topicOrder)
  return (
    <>
      <header className="page-head">
        <h1>Topics</h1>
      </header>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Topic</th>
              <th>Total</th>
              <th>New</th>
              <th>Learning</th>
              <th>Mastered</th>
              <th className="col-lo">Interview pending</th>
              <th>Progress</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.topic}>
                <td>
                  <Link to={'/topics/' + encodeURIComponent(r.topic)}>{r.topic}</Link>
                </td>
                <td className="num">{r.total}</td>
                <td className="num">{r.new}</td>
                <td className="num">{r.learning}</td>
                <td className="num">{r.mastered}</td>
                <td className="num col-lo">{r.interviewPending}</td>
                <td>
                  <div className="bar bar-cell" aria-hidden="true">
                    <i
                      style={{ width: r.total === 0 ? '0%' : `${Math.round((r.mastered / r.total) * 100)}%` }}
                    />
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  No topics yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}
