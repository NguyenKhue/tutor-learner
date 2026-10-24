import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { useHotkey } from '../hooks/useHotkey'
import { useTutorData } from '../hooks/useTutorData'
import { daysBetween } from '../lib/day'
import { pointTitle } from '../lib/format'
import { streak } from '../lib/stats'
import { itemDone } from '../lib/today'
import type { Point, TodayList } from '../lib/types'

type Kind = 'review' | 'learn'

/** What one card of today's list needs to render. */
interface Row {
  id: string
  href: string
  kind: Kind
  done: boolean
  point: Point | undefined
  /** Set for a note in "Reading review": its title, topic and whether it is a reread. */
  note?: { title: string; topic: string | null; reread: boolean }
}

/** A friendly date like `Thursday, October 22` for a YYYY-MM-DD string. */
const longDay = (date: string) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })

/** One card of today's list. */
function Item({ row }: { row: Row }) {
  const { point } = row
  return (
    <li className={`card${row.done ? ' done' : ''}`}>
      <div className="head">
        <h3 className="title">
          <Link to={row.href}>{row.note ? row.note.title : pointTitle(row.id)}</Link>
        </h3>
        {row.done && (
          <span className="check" aria-label="Done">
            ✓
          </span>
        )}
      </div>
      <div className="meta">
        {row.note?.topic && <span>{row.note.topic}</span>}
        {row.note && <span className="tag">{row.note.reread ? 'read again' : 'recheck'}</span>}
        {point && <span>{point.topic}</span>}
        {point && <span className="tag">{point.type}</span>}
        {point?.interview && <span className="tag interview">interview</span>}
      </div>
    </li>
  )
}

/** One named accessible region of today's list (Review / New / Extra). */
function Section({ name, rows }: { name: string; rows: Row[] }) {
  const id = `${name.replace(/\s+/g, '-').toLowerCase()}-h`
  return (
    <section aria-labelledby={id}>
      <h2 id={id}>{name}</h2>
      <ul className="list">
        {rows.map((row) => (
          <Item key={row.id} row={row} />
        ))}
      </ul>
    </section>
  )
}

/** Today: hero with countdown and progress, then Review / New / Extra sections. */
export function TodayPage() {
  const { data, error, setList } = useTutorData()
  const navigate = useNavigate()
  const [pending, setPending] = useState(false)

  const { review, fresh, extra, reading } = useMemo(() => {
    if (!data) return { review: [], fresh: [], extra: [], reading: [] }
    const byId = new Map(data.export.points.map((p) => [p.id, p]))
    const rowOf = (id: string, kind: Kind): Row => {
      const point = byId.get(id)
      return {
        id,
        href: `/study/${encodeURIComponent(id)}?kind=${kind}`,
        kind,
        point,
        done: !!point && itemDone(point, data.today),
      }
    }
    const review = data.list.review.map((id) => rowOf(id, 'review'))
    const fresh = data.list.fresh.map((id) => rowOf(id, 'learn'))
    const extra = data.list.extra.map((id) => {
      const point = byId.get(id)
      const due = !!point?.next_review && point.next_review <= data.today
      return rowOf(id, due ? 'review' : 'learn')
    })
    const reading: Row[] = (data.list.reading ?? []).map((path) => {
      const info = data.reading?.[path]
      return {
        id: path,
        href: `/read/${encodeURIComponent(path)}`,
        kind: 'review',
        point: undefined,
        done: !!info?.done,
        note: { title: info?.title ?? path, topic: info?.topic ?? null, reread: info?.kind === 'reread' },
      }
    })
    return { review, fresh, extra, reading }
  }, [data])

  const rows = useMemo(() => [...review, ...fresh, ...extra, ...reading], [review, fresh, extra, reading])

  const done = rows.filter((r) => r.done).length
  const total = rows.length
  const interviewDays = data?.export.config.interview_date ? daysBetween(data.today, data.export.config.interview_date) : null

  /** Opens the first not-done item of today's list. */
  const openFirst = () => {
    const first = rows.find((r) => !r.done)
    if (first) navigate(first.href)
  }
  useHotkey('n', openFirst)

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
    return <p className="hint">Loading…</p>
  }

  return (
    <div>
      <div className="hero">
        <div>
          <div className="eyebrow">{longDay(data.today)}</div>
          <h1>
            {interviewDays === null ? (
              'Your study day'
            ) : (
              <span className="countdown">{interviewDays} days to interview</span>
            )}
          </h1>
          <span className="streak-chip">{`${streak(data.export.points, data.today)}-day streak`}</span>
        </div>
        {total > 0 && (
          <div className="progress" aria-label="Today's progress">
            <div className="segs">
              {rows.map((r, i) => (
                <i key={r.id} className={i < done ? 'on' : ''} />
              ))}
            </div>
            <div className="mono">{`${done} / ${total}`} done</div>
          </div>
        )}
      </div>

      {review.length > 0 && <Section name="Review" rows={review} />}
      {fresh.length > 0 && <Section name="New" rows={fresh} />}
      {extra.length > 0 && <Section name="Extra" rows={extra} />}
      {reading.length > 0 && <Section name="Reading review" rows={reading} />}
      {total === 0 && <p className="hint">Nothing left today.</p>}

      <div className="foot">
        <button type="button" className="btn" disabled={pending} onClick={() => void addExtra()}>
          Study one more
        </button>
      </div>
    </div>
  )
}
