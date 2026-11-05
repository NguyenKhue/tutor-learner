import { Link, useParams } from 'react-router-dom'
import { useTutorData } from '../hooks/useTutorData'
import { STATUS_LABEL, pointTitle } from '../lib/format'
import { nextInTopic } from '../lib/stats'
import { Skeleton } from '../components/Loading'

/** Topic: the points of one topic, listed in their order within the vault. */
export function TopicPage() {
  const { topic = '' } = useParams()
  const { data } = useTutorData()
  if (!data) return <Skeleton />

  const points = data.export.points
    .filter((p) => p.topic === topic)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
  const started = points.filter((p) => p.status !== 'new').length
  const mastered = points.filter((p) => p.status === 'mastered').length
  const next = nextInTopic(points, topic)
  // nextInTopic builds the href from a point id, so the same point can be found again for its title.
  const nextPoint = next ? points.find((p) => next.href.startsWith(`/study/${encodeURIComponent(p.id)}?`)) : undefined

  return (
    <>
      <Link className="back page-back" to="/topics">← Topics</Link>
      <div className="topic-page work">
        <div className="work-main">
          <header className="topic-head">
            <h1>{topic || 'Topic'}</h1>
            <p>{`${started} of ${points.length} started, ${mastered} mastered`}</p>
          </header>
          {points.length === 0 ? (
            <p className="hint">No points in this topic yet.</p>
          ) : (
            <ol className="topic-points">
              {points.map((p, i) => {
                const pct = Math.round(p.mastery * 100)
                const tag = p.status === 'mastered' ? 'tag tag-mastered' : p.status === 'new' ? 'tag tag-new' : 'tag'
                return (
                  <li key={p.id} className="topic-point">
                    <span className="topic-point-num">{String(i + 1).padStart(2, '0')}</span>
                    <Link className="point-link" to={'/point/' + encodeURIComponent(p.id)}>{pointTitle(p.id)}</Link>
                    <span className={tag}>{STATUS_LABEL[p.status]}</span>
                    <span className="point-mastery">
                      <span className={`mastery-bar${p.status === 'mastered' ? ' is-mastered' : ''}`} aria-hidden="true">
                        <i style={{ width: `${pct}%` }} />
                      </span>
                      <span className="point-pct">{pct}%</span>
                    </span>
                  </li>
                )
              })}
            </ol>
          )}
        </div>
        {next && (
          <aside className="work-aside">
            <section className="room next-in-topic" aria-labelledby="tp-next">
              <span className="room-eyebrow">Next in this topic</span>
              <h2 id="tp-next">{nextPoint ? pointTitle(nextPoint.id) : 'Next point'}</h2>
              {nextPoint && nextPoint.next_review && (
                <p className="next-note">
                  {nextPoint.next_review <= data.today ? 'A review, due today.' : `Next review ${nextPoint.next_review}.`}
                </p>
              )}
              <Link className="btn amber" to={next.href}>Start</Link>
            </section>
          </aside>
        )}
      </div>
    </>
  )
}
