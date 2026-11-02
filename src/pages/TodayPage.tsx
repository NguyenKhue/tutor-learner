import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useHotkey } from '../hooks/useHotkey'
import { useTutorData } from '../hooks/useTutorData'
import { daysBetween } from '../lib/day'
import { streak } from '../lib/stats'
import { todayRows, type TodayRow } from '../lib/today'
import type { TodayList } from '../lib/types'
import { Skeleton } from '../components/Loading'

/** One item waiting after the next one, or already done. */
function QueueItem({ row }: { row: TodayRow }) {
  return (
    <li className={row.done ? 'queue-item done' : 'queue-item'}>
      {row.done ? <span className="check" aria-label="Done">✓</span> : <span className="queue-dot" aria-hidden="true" />}
      <Link to={row.href}>{row.title}</Link>
      <span className="hint">{row.label}</span>
    </li>
  )
}

/** Today: the one next thing to do with a Start button, how the day is going, then the rest of the list. */
export function TodayPage() {
  const { data, error, setList } = useTutorData()
  const navigate = useNavigate()
  const [pending, setPending] = useState(false)

  const rows = useMemo(() => (data ? todayRows(data) : []), [data])
  const next = rows.find((r) => !r.done)
  const done = rows.filter((r) => r.done).length
  const total = rows.length
  const interviewDays = data?.export.config.interview_date ? daysBetween(data.today, data.export.config.interview_date) : null
  const days = data ? streak(data.export.points, data.today) : 0

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

  return (
    <div className="today">
      <div className="day-head">
        {interviewDays !== null && <p className="day-count"><b>{interviewDays}</b> days to interview</p>}
        <p className="streak-chip">{days > 0 ? `${days}-day streak` : 'Start a streak today'}</p>
      </div>

      {next ? (
        <section className="card next" aria-labelledby="next-h">
          <div className="eyebrow">{`Next · ${next.label}`}</div>
          <h1 id="next-h">{next.title}</h1>
          {next.topic && <p className="next-topic">{next.topic}</p>}
          <Link className="btn primary wide" to={next.href}>Start</Link>
        </section>
      ) : total > 0 ? (
        <section className="card next finished" aria-labelledby="next-h">
          <span className="finish-mark" aria-hidden="true">✓</span>
          <h1 id="next-h">All done for today</h1>
          <p className="next-topic">{`You finished all ${total}. Come back tomorrow to keep your streak.`}</p>
        </section>
      ) : (
        <section className="card next" aria-labelledby="next-h">
          <h1 id="next-h">Nothing left today.</h1>
          <p className="next-topic">Add one more point if you still have time.</p>
        </section>
      )}

      {total > 0 && (
        <div className="day-status" aria-label="Today's progress">
          <span>{`${done} of ${total} done today`}</span>
          <div className="segs" aria-hidden="true">
            {rows.map((r, i) => <i key={r.id} className={i < done ? 'on' : ''} />)}
          </div>
        </div>
      )}

      {rows.length > (next ? 1 : 0) && (
        <ul className="queue" aria-label="Today's list">
          {rows.filter((r) => r !== next).map((r) => <QueueItem key={r.id} row={r} />)}
        </ul>
      )}

      <div className="foot">
        <button type="button" className={next ? 'btn ghost' : 'btn primary'} disabled={pending} onClick={() => void addExtra()}>
          Study one more
        </button>
      </div>
    </div>
  )
}
