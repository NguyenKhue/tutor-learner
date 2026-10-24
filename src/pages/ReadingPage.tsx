import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api/client'
import { useReading } from '../hooks/useReading'
import type { ReadingItem, ReadingOverview } from '../lib/types'

const readHref = (path: string) => `/read/${encodeURIComponent(path)}`

/** One suggested or due note. */
function NoteCard({ item, onSkip }: { item: ReadingItem; onSkip?: () => void }) {
  return (
    <li className="card">
      <div className="head">
        <h3 className="title">
          <Link to={readHref(item.path)}>{item.title}</Link>
        </h3>
        {onSkip && (
          <button type="button" className="btn small" onClick={onSkip}>
            Skip
          </button>
        )}
      </div>
      <div className="meta">
        {item.topic && <span>{item.topic}</span>}
        {item.minutes && <span className="mono">{`~${item.minutes} min`}</span>}
        {item.priority && <span className="tag">{item.priority}</span>}
        {item.status === 'reread' && <span className="tag">read again</span>}
      </div>
      {item.why && <p className="hint">{item.why}</p>}
    </li>
  )
}

function Region({ name, children }: { name: string; children: React.ReactNode }) {
  const id = `${name.replace(/\s+/g, '-').toLowerCase()}-h`
  return (
    <section aria-labelledby={id}>
      <h2 id={id}>{name}</h2>
      {children}
    </section>
  )
}

/** Reading: what to read next, what is due again, progress per topic, and the whole catalog. */
export function ReadingPage() {
  const { data, error, reload, setData } = useReading()
  const [topic, setTopic] = useState('')
  const byPath = useMemo(() => new Map((data?.items ?? []).map((i) => [i.path, i])), [data])

  if (!data) return error ? <pre className="error-box">{`Could not load: ${error}`}</pre> : <p className="hint">Loading…</p>

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

  return (
    <>
      <header className="page-head">
        <h1>Reading</h1>
        <p>Your own notes, in an order that follows what you are studying.</p>
        <p className="hint">
          {running ? `Classifying… ${done} / ${total}` : `Classified ${done} / ${total}`}
          {classifyError && ` — stopped: ${classifyError}`}
        </p>
        {done === 0 && !running && (
          <button type="button" className="btn primary" onClick={() => void classify()}>
            Build reading list
          </button>
        )}
        {done > 0 && done < total && !running && (
          <button type="button" className="btn" onClick={() => void classify()}>
            Continue classifying
          </button>
        )}
      </header>

      <Region name="Up next">
        {data.upNext.length === 0 ? (
          <p className="hint">Nothing to suggest yet.</p>
        ) : (
          <ul className="list">
            {data.upNext.map((p) => byPath.get(p)).filter((i): i is ReadingItem => !!i).map((i) => (
              <NoteCard key={i.path} item={i} onSkip={() => void skip(i.path)} />
            ))}
          </ul>
        )}
      </Region>

      {data.due.length > 0 && (
        <Region name="Due for recheck">
          <ul className="list">
            {data.due.map((p) => byPath.get(p)).filter((i): i is ReadingItem => !!i).map((i) => (
              <NoteCard key={i.path} item={i} />
            ))}
          </ul>
        </Region>
      )}

      <Region name="Progress by topic">
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Topic</th><th>Notes</th><th>Understood</th><th>Read again</th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.topic}><td>{r.topic}</td><td>{r.total}</td><td>{r.understood}</td><td>{r.reread}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Region>

      <Region name="Browse">
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
      </Region>
    </>
  )
}
