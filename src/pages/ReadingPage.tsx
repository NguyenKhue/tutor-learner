import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useReading } from '../hooks/useReading'
import type { ReadingItem, ReadingOverview } from '../lib/types'
import { Skeleton } from '../components/Loading'

const readHref = (path: string) => `/read/${encodeURIComponent(path)}`

/** The note to read next: the one thing to do now, in the dark room. */
function NextNote({ item, onSkip }: { item: ReadingItem; onSkip(): void }) {
  return (
    <section className="room read-next" aria-labelledby="read-next-h">
      <span className="room-eyebrow">Read next</span>
      <h2 id="read-next-h"><Link to={readHref(item.path)}>{item.title}</Link></h2>
      <p className="next-meta">
        {item.topic && <span>{item.topic}</span>}
        {item.minutes && <span>{`~${item.minutes} min`}</span>}
      </p>
      {item.why && <p className="next-why">{item.why}</p>}
      <div className="next-actions">
        <Link className="btn amber wide" to={readHref(item.path)} aria-label={`Read ${item.title}`}>Read</Link>
        <button type="button" className="btn on-dark" onClick={onSkip}>Skip</button>
      </div>
    </section>
  )
}

/** One note in the due or up-next list: a white row with its topic or length and a status tag. */
function NoteRow({ item, due = false }: { item: ReadingItem; due?: boolean }) {
  const meta = due
    ? item.topic || (item.minutes ? `~${item.minutes} min` : '')
    : item.minutes ? `~${item.minutes} min` : item.topic || ''
  const tag = due
    ? item.status === 'reread'
      ? { text: 'Read again', className: 'tag-again' }
      : { text: 'Quiz only', className: 'tag-review' }
    : item.status === 'reread'
      ? { text: 'Read again', className: 'tag-again' }
      : null

  return (
    <li className="reading-row">
      <Link to={readHref(item.path)}>{item.title}</Link>
      {meta && <span className="reading-meta">{meta}</span>}
      {tag && <span className={`tag ${tag.className}`}>{tag.text}</span>}
    </li>
  )
}

/** Reading: what to read next, what is due again, progress per topic, and the whole catalog. */
export function ReadingPage() {
  const { data, error, reload, setData } = useReading()
  const [topic, setTopic] = useState('')
  const byPath = useMemo(() => new Map((data?.items ?? []).map((i) => [i.path, i])), [data])

  if (!data) return error ? <pre className="error-box">{`Could not load: ${error}`}</pre> : <Skeleton />

  const skip = async (path: string) => {
    await api.post('/api/reading/skip', { path, skipped: true })
    await reload()
  }
  const classify = async () => setData(await api.post<ReadingOverview>('/api/reading/classify', {}))

  const present = data.items.filter((i) => i.present)
  const topics = [...new Set(present.map((i) => i.topic).filter((t): t is string => !!t))]
  const rows = topics.map((t) => {
    const list = present.filter((i) => i.topic === t && i.priority !== 'skip')
    return {
      topic: t,
      total: list.length,
      understood: list.filter((i) => i.status === 'understood' || i.status === 'done').length,
      reread: list.filter((i) => i.status === 'reread').length,
    }
  })
  const browse = present.filter((i) => (topic === '' ? true : topic === '(none)' ? !i.topic : i.topic === topic))
  const { total, done, running, error: classifyError } = data.classify

  const suggested = data.upNext.map((p) => byPath.get(p)).filter((i): i is ReadingItem => !!i)
  const due = data.due.map((p) => byPath.get(p)).filter((i): i is ReadingItem => !!i)

  return (
    <>
      <header className="page-head">
        <h1>Reading</h1>
        <p>Your notes, in the order that helps most. Read one, then answer three short questions.</p>
        {(done < total || running || classifyError) && (
          <p className="hint">
            {running ? `Classifying… ${done} / ${total}` : `Classified ${done} / ${total}`}
            {classifyError && ` — stopped: ${classifyError}`}
          </p>
        )}
        {done === 0 && !running && (
          <button type="button" className="btn primary" onClick={() => void classify()}>
            Build reading list
          </button>
        )}
        {done > 0 && done < total && !running && (
          <button type="button" className="btn outline" onClick={() => void classify()}>
            Continue classifying
          </button>
        )}
      </header>

      <div className="reading work">
        <div className="work-main">
          <section className="up-next" aria-label="Up next">
            {suggested.length === 0 ? (
              <p className="hint">Nothing to suggest yet.</p>
            ) : (
              <NextNote item={suggested[0]} onSkip={() => void skip(suggested[0].path)} />
            )}

            {due.length > 0 && (
              <section className="reading-block" aria-label="Due for recheck">
                <h2>Due for a recheck</h2>
                <ul className="reading-list">
                  {due.map((i) => <NoteRow key={i.path} item={i} due />)}
                </ul>
              </section>
            )}

            <section className="reading-block">
              <h2>Up next</h2>
              {suggested.length > 1 && (
                <ul className="reading-list">
                  {suggested.slice(1).map((i) => <NoteRow key={i.path} item={i} />)}
                </ul>
              )}
            </section>
          </section>
        </div>

        <aside className="work-aside">
          <section className="card by-topic" aria-label="Progress by topic">
            <h2>By topic</h2>
            <div className="topic-bars" role="table" aria-label="Notes by topic">
              {rows.map((r) => {
                const understoodPct = r.total ? (r.understood / r.total) * 100 : 0
                const rereadPct = r.total ? (r.reread / r.total) * 100 : 0
                return (
                  <div className="topic-row" role="row" key={r.topic}>
                    <span className="topic-name" role="cell">{r.topic}</span>
                    <span className="topic-count" role="cell">{`${r.understood} of ${r.total}`}</span>
                    <span className="topic-track" role="cell" aria-label={`${r.understood} of ${r.total} understood`}>
                      <i className="understood" style={{ width: `${understoodPct}%` }} />
                      <i className="reread" style={{ width: `${rereadPct}%` }} />
                    </span>
                  </div>
                )
              })}
            </div>
            <p className="topic-legend">
              <span><i className="understood" aria-hidden="true" />Understood</span>
              <span><i className="reread" aria-hidden="true" />Read again</span>
            </p>
          </section>

          <section className="card all-notes" aria-labelledby="r-all">
            <h2 id="r-all">All notes</h2>
            <label htmlFor="browse-topic">Topic</label>{' '}
            <select id="browse-topic" value={topic} onChange={(e) => setTopic(e.target.value)}>
              <option value="">All notes</option>
              {topics.map((t) => <option key={t} value={t}>{t}</option>)}
              <option value="(none)">Not for the interview</option>
            </select>
            <ul className="plain-list">
              {browse.map((i) => (
                <li key={i.path}>
                  <Link to={readHref(i.path)}>{i.title}</Link> <span className="hint">{i.status}{i.skipped ? ', skipped' : ''}</span>{' '}
                  <button type="button" className="link-btn" onClick={() => void api.post('/api/reading/reclassify', { path: i.path }).then(reload)}>
                    Reclassify
                  </button>
                  {i.skipped && (
                    <button type="button" className="link-btn" onClick={() => void api.post('/api/reading/skip', { path: i.path, skipped: false }).then(reload)}>
                      Unskip
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </>
  )
}
