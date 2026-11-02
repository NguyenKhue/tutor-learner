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
      {next ? (
        <section className="card next" aria-labelledby="next-h">
          <div className="eyebrow">{`Next · ${next.label}`}</div>
          <h1 id="next-h">{next.title}</h1>
          {next.topic && <p className="next-topic">{next.topic}</p>}
          <Link className="btn primary wide" to={next.href}>Start</Link>
        </section>
      ) : (
        <section className="card next" aria-labelledby="next-h">
          <div className="eyebrow">Today</div>
          <h1 id="next-h">{total > 0 ? 'All done for today' : 'Nothing left today.'}</h1>
          <p className="next-topic">Add one more point if you still have time.</p>
        </section>
      )}

      {total > 0 && (
        <div className="day-status" aria-label="Today's progress">
          <div className="row spread">
            <span>{`${done} of ${total} done today`}</span>
            {interviewDays !== null && <span>{`${interviewDays} days to interview`}</span>}
          </div>
          <div className="bar"><i style={{ width: `${Math.round((done / total) * 100)}%` }} /></div>
        </div>
      )}
      {total === 0 && interviewDays !== null && <p className="hint">{`${interviewDays} days to interview`}</p>}
      {days > 0 && <p className="streak-chip">{`${days}-day streak`}</p>}

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
