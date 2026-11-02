import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { useTutorData } from '../hooks/useTutorData'
import { STATUS_LABEL, obsidianUrl, pointTitle } from '../lib/format'
import type { Attempt } from '../lib/types'
import { Skeleton } from '../components/Loading'

/** The error message of any thrown request failure. */
const asMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** The Obsidian target of a stored wikilink: the text inside `[[ ]]`, without `#…` or `|…`; null when not a wikilink. */
function wikilinkTarget(source: string): string | null {
  const inner = /^\[\[(.+)\]\]$/.exec(source)?.[1]
  return inner ? inner.split('#')[0].split('|')[0] : null
}

/** The readable name of a stored wikilink. */
const noteName = (source: string) => (wikilinkTarget(source) as string).split('/').pop()

/** Point: its facts, the point's answer history, past attempts from the web and Obsidian links. */
export function PointPage() {
  const { pointId = '' } = useParams()
  const { data } = useTutorData()

  const [attempts, setAttempts] = useState<Attempt[] | null>(null)
  const [attemptsError, setAttemptsError] = useState<string | null>(null)

  // Past attempts from the web live outside the overview snapshot, so fetch them per point.
  useEffect(() => {
    let on = true
    ;(async () => {
      try {
        const rows = await api.get<Attempt[]>(`/api/attempts?point=${encodeURIComponent(pointId)}`)
        if (on) setAttempts(rows)
      } catch (e) {
        if (on) setAttemptsError(asMsg(e))
      }
    })()
    return () => {
      on = false
    }
  }, [pointId])

  if (!data) return <Skeleton />
  const point = data.export.points.find((p) => p.id === pointId)
  if (!point) return <p className="hint">Point not found.</p>

  const kind = point.next_review && point.next_review <= data.today ? 'review' : 'learn'
  const sources = point.sources.filter((s) => wikilinkTarget(s) !== null)
  return (
    <>
      <Link className="back page-back" to={`/topics/${encodeURIComponent(point.topic)}`}>{`← ${point.topic}`}</Link>
      <header className="page-head">
        <h1>{pointTitle(point.id)}</h1>
        <div className="meta">
          <span>{STATUS_LABEL[point.status]}</span>
          <span className="mastery-pct">{Math.round(point.mastery * 100)}%</span>
          {point.next_review && <span>Next review {point.next_review}</span>}
        </div>
      </header>

      <div className="study">
        <div className="row">
          <Link className="btn primary" to={`/study/${encodeURIComponent(point.id)}?kind=${kind}`}>
            Study now
          </Link>
          <a className="btn" href={obsidianUrl(data.vaultName, `Tutor/Lessons/${point.id}.md`)}>
            Open lesson in Obsidian
          </a>
        </div>

        {sources.length > 0 && (
          <section aria-labelledby="sources-h">
            <h2 id="sources-h">Sources</h2>
            <ul className="subs">
              {sources.map((s) => (
                <li key={s}>
                  <a href={obsidianUrl(data.vaultName, wikilinkTarget(s) as string)}>{noteName(s)}</a>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="history-h">
          <h2 id="history-h">History</h2>
          {point.history.length === 0 ? (
            <p className="hint">Nothing yet.</p>
          ) : (
            <ul className="log">
              {point.history.map((h, i) => (
                <li key={`${h.d}-${i}`}>
                  <div className="log-head">
                    <b className={h.ok ? 'right' : 'wrong'}>{h.ok ? 'Correct' : 'Not yet'}</b>
                    <span className="hint">{h.d}</span>
                    <span className="hint">{h.kind === 'review' ? 'Review' : 'Learn'}</span>
                  </div>
                  <p>{h.why}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="attempts-h">
          <h2 id="attempts-h">Answers from the web</h2>
          {attemptsError !== null && (
            <div className="error-box" role="alert">
              {attemptsError}
            </div>
          )}
          {attempts === null ? (
            <Skeleton />
          ) : attempts.length === 0 ? (
            <p className="hint">No answers from the web yet.</p>
          ) : (
            <ul className="log">
              {attempts.map((a) => (
                <li key={a.id}>
                  <div className="log-head"><span className="hint">{a.date}</span></div>
                  <p>{a.answer}</p>
                  <p className="hint">{a.grade?.why ?? a.error?.message ?? ''}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  )
}
