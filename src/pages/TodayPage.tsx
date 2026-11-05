import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useHotkey } from '../hooks/useHotkey'
import { useTutorData } from '../hooks/useTutorData'
import { daysBetween } from '../lib/day'
import { dueForecast, streak } from '../lib/stats'
import { todayRows, type TodayRow } from '../lib/today'
import type { InterviewSession, TodayList, WeakSpotSummary } from '../lib/types'
import { Skeleton } from '../components/Loading'

/** The room's eyebrow: what kind of thing comes next. */
function nextLabel(row: TodayRow): string {
  if (row.label === 'Review') return 'Next, a review'
  if (row.label === 'New' || row.label === 'Extra') return 'Next, a new point'
  return 'Next, a note'
}

/** The short status tag a row wears. */
function rowTag(row: TodayRow): { text: string; className: string } {
  switch (row.label) {
    case 'Review':
      return { text: 'Review', className: 'tag-review' }
    case 'New':
      return { text: 'New', className: 'tag-new' }
    case 'Extra':
      return { text: 'Extra', className: 'tag-new' }
    case 'Recheck':
      return { text: 'Read', className: 'tag-read' }
    default:
      return { text: 'Read again', className: 'tag-read' }
  }
}

/** A short weekday for the review forecast bars. */
function weekday(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })
}

/** One item waiting after the next one, or already done. */
function QueueItem({ row }: { row: TodayRow }) {
  const tag = rowTag(row)
  return (
    <li className={row.done ? 'queue-item done' : 'queue-item'}>
      {row.done ? <span className="check" aria-label="Done">✓</span> : <span className="queue-dot" aria-hidden="true" />}
      <Link to={row.href}>{row.title}</Link>
      <span className={`tag ${tag.className}`}>{tag.text}</span>
    </li>
  )
}

/** Today: the one next thing to do in a dark room, how the day is going, the rest of the list, and a quiet side column. */
export function TodayPage() {
  const { data, error, setList } = useTutorData()
  const navigate = useNavigate()
  const [pending, setPending] = useState(false)
  const [mock, setMock] = useState<{ levelMet: boolean; spot: WeakSpotSummary | null } | null>(null)

  const rows = useMemo(() => (data ? todayRows(data) : []), [data])
  const forecast = useMemo(() => (data ? dueForecast(data.export.points, data.today, 5) : []), [data])
  const next = rows.find((r) => !r.done)
  const later = rows.filter((r) => r !== next)
  const done = rows.filter((r) => r.done).length
  const total = rows.length
  const interviewDays = data?.export.config.interview_date ? daysBetween(data.today, data.export.config.interview_date) : null
  const days = data ? streak(data.export.points, data.today) : 0

  useEffect(() => {
    let alive = true
    Promise.all([api.get<InterviewSession[]>('/api/interviews'), api.get<WeakSpotSummary[]>('/api/interview/weak-spots')])
      .then(([sessions, spots]) => {
        if (!alive) return
        const newest = sessions
          .filter((s) => s.state === 'done' && s.report)
          .sort((a, b) => b.created.localeCompare(a.created))[0]
        if (!newest?.report) return setMock(null)
        setMock({ levelMet: newest.report.levelMet, spot: spots.find((s) => s.trend === 'still') ?? null })
      })
      .catch(() => {
        if (alive) setMock(null)
      })
    return () => {
      alive = false
    }
  }, [])

  useHotkey('n', () => {
    if (next) navigate(next.href)
  })

  /** Asks the server for one more point and swaps today's list for the new copy. */
  const addExtra = async () => {
    setPending(true)
    try {
      setList(await api.post<TodayList>('/api/today/extra', {}))
    } finally {
      setPending(false)
    }
  }

  if (!data) {
    if (error) return <pre className="error-box">{`Could not load: ${error.message}`}</pre>
    return <Skeleton />
  }

  const points = data.export.points
  const mastered = points.filter((p) => p.status === 'mastered').length
  const masteredPct = points.length ? (mastered / points.length) * 100 : 0
  const maxForecast = Math.max(1, ...forecast.map((d) => d.count))

  return (
    <div className="today work">
      <div className="work-main">
        <div className="day-head">
          {interviewDays !== null && <p className="day-count"><b>{interviewDays}</b> days to interview</p>}
          <span className="tag tag-review day-streak">{days > 0 ? `${days}-day streak` : 'Start a streak today'}</span>
        </div>

        {next ? (
          <section className="room next-room" aria-labelledby="next-h">
            <span className="room-eyebrow">{nextLabel(next)}</span>
            <h1 id="next-h">{next.title}</h1>
            {next.topic && <p className="next-topic">{next.topic}</p>}
            <div className="next-actions">
              <Link className="btn amber wide" to={next.href}>Start</Link>
              <span className="next-hint">or press N</span>
            </div>
          </section>
        ) : total > 0 ? (
          <section className="room next-room finished" aria-labelledby="next-h">
            <span className="finish-mark" aria-hidden="true">✓</span>
            <h1 id="next-h">All done for today</h1>
            <p className="next-topic">{`You finished all ${total}. Come back tomorrow to keep your streak.`}</p>
          </section>
        ) : (
          <section className="room next-room" aria-labelledby="next-h">
            <h1 id="next-h">Nothing left today.</h1>
            <p className="next-topic">Add one more point if you still have time.</p>
          </section>
        )}

        {total > 0 && (
          <div className="day-status" aria-label="Today's progress">
            <span>{`${done} of ${total} done today`}</span>
            <div className="segs" aria-hidden="true">
              {rows.map((r) => <i key={r.id} className={r.done ? 'on' : ''} />)}
            </div>
          </div>
        )}

        {later.length > 0 && (
          <section className="later" aria-labelledby="later-h">
            <h2 id="later-h">Later today</h2>
            <ul className="queue" aria-label="Today's list">
              {later.map((r) => <QueueItem key={r.id} row={r} />)}
            </ul>
          </section>
        )}

        <div className="foot">
          <button type="button" className="btn outline" disabled={pending} onClick={() => void addExtra()}>
            Study one more
          </button>
        </div>
      </div>

      <aside className="work-aside">
        <section className="card" aria-labelledby="week-h">
          <h2 id="week-h">Reviews coming up</h2>
          <div
            className="forecast"
            role="img"
            aria-label={forecast.map((d) => `${weekday(d.date)} ${d.count}`).join(', ')}
          >
            {forecast.map((d) => (
              <div key={d.date}>
                <i style={{ height: `${d.count === 0 ? 4 : Math.max(8, Math.round((d.count / maxForecast) * 88))}px` }} />
                <span>{weekday(d.date)}</span>
              </div>
            ))}
          </div>
          <p className="forecast-note">{`${forecast[1]?.count ?? 0} reviews tomorrow.`}</p>
        </section>

        {mock && (
          <section className="card mock-card" aria-labelledby="mock-h">
            <h2 id="mock-h">Mock interview</h2>
            <p className="mock-line">Your last one:</p>
            <p className="mock-result">{mock.levelMet ? 'Level met' : 'Level not met yet'}</p>
            {mock.spot && (
              <>
                <p className="mock-line">Still there:</p>
                <p className="mock-spot">{mock.spot.label}</p>
              </>
            )}
            <Link to="/interview/new">Practice a new interview</Link>
          </section>
        )}

        <section className="card mastery-card" aria-labelledby="mastery-h">
          <h2 id="mastery-h">Mastered so far</h2>
          <p className="mastery-count"><b>{mastered}</b> <span>{`of ${points.length} points`}</span></p>
          <span className="mastery-bar" aria-hidden="true"><i style={{ width: `${masteredPct}%` }} /></span>
        </section>
      </aside>
    </div>
  )
}
