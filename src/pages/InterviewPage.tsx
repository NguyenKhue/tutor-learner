import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { InterviewReport } from '../components/InterviewReport'
import { InterviewRun } from '../components/InterviewRun'
import { Skeleton, Working } from '../components/Loading'
import type { InterviewSession, InterviewState, Voice } from '../lib/types'

const HIDE_KEY = 'tutor.interview.hideText'

const readHide = (): boolean => {
  try {
    return localStorage.getItem(HIDE_KEY) === '1'
  } catch {
    return false
  }
}

const WAITING: Partial<Record<InterviewState, string>> = {
  researching: 'Searching the web',
  planning: 'Preparing your interview',
  thinking: 'The interviewer is thinking',
  reporting: 'Writing your report',
}

/** One interview by id: waits, review of research, the live session, or the report. */
export function InterviewPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [session, setSession] = useState<InterviewSession | null>(null)
  const [failed, setFailed] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [dropped, setDropped] = useState<number[]>([])
  const [hideText, setHideText] = useState(readHide)
  const changeHide = (hide: boolean) => {
    setHideText(hide)
    try {
      localStorage.setItem(HIDE_KEY, hide ? '1' : '0')
    } catch {
      // storage is blocked: the setting lasts until the page closes
    }
  }

  const load = useCallback((keepError = false) => api.get<InterviewSession>(`/api/interview?id=${encodeURIComponent(id)}`)
    .then((s) => { setSession(s); if (!keepError) setFailed(null) })
    .catch((e) => { if (!keepError) setFailed(e instanceof Error ? e.message : 'Could not load the interview.') }), [id])

  useEffect(() => { void load() }, [load])

  const waiting = !!session && !session.error && (session.state in WAITING
    || (session.state === 'done' && session.practice.some((p) => !p.result && !p.error)))
  useEffect(() => {
    if (!waiting) return
    const timer = setInterval(() => void load(), 2000)
    return () => clearInterval(timer)
  }, [waiting, load])

  /** Runs one action route; the server answers with the new session. */
  const post = async (action: string, body: Record<string, unknown> = {}): Promise<boolean> => {
    setBusy(true)
    try {
      setSession(await api.post<InterviewSession>(`/api/interview/${action}`, { id, ...body }))
      setFailed(null)
      return true
    } catch (e) {
      setFailed(e instanceof Error ? e.message : 'That did not work.')
      await load(true).catch(() => undefined) // the server may have moved on (409): show where it really is
      return false
    } finally {
      setBusy(false)
    }
  }

  if (!session) {
    return failed ? <p className="hint" role="alert">{failed}</p> : <Skeleton />
  }

  const alert = failed && <p className="hint" role="alert">{failed}</p>

  if (session.state === 'done') {
    return (
      <>
        {alert}
        <InterviewReport
          session={session}
          busy={busy}
          practice={(q, text, voice: Voice | null) => post('practice', { q, text, ...(voice ? { voice } : {}) })}
          retry={() => post('retry')}
        />
      </>
    )
  }

  if (session.state === 'review') {
    const items = session.research ?? []
    const keptIndexes = items.map((_, i) => i).filter((i) => !dropped.includes(i))
    return (
      <>
        <header className="page-head">
          <h1>Check the research</h1>
          <p>Untick anything that looks wrong. The interviewer will use the rest.</p>
        </header>
        {session.error && <p className="hint" role="alert">{session.error.message}</p>}
        {items.length === 0 && !session.error && <p className="hint">Nothing was found. You can still start.</p>}
        <ul className="research-list">
          {items.map((it, i) => (
            <li key={i}>
              <label className="check">
                <input type="checkbox" checked={!dropped.includes(i)} onChange={() => setDropped(dropped.includes(i) ? dropped.filter((x) => x !== i) : [...dropped, i])} />
                <span>{it.text}</span>
              </label>
              {it.url && <a className="hint" href={it.url} target="_blank" rel="noreferrer">{it.url}</a>}
            </li>
          ))}
        </ul>
        {alert}
        <div className="row">
          <button type="button" className="btn primary wide" disabled={busy} onClick={() => void post('research', { kept: keptIndexes })}>Start interview</button>
          {items.length === 0 && <button type="button" className="btn" disabled={busy} onClick={() => void post('retry')}>Search again</button>}
        </div>
      </>
    )
  }

  if (session.error) {
    return (
      <>
        <header className="page-head"><h1>Something went wrong</h1></header>
        <div className="error-box" role="alert">{session.error.message}</div>
        <div className="row">
          <button type="button" className="btn primary wide" disabled={busy} onClick={() => void post('retry')}>Try again</button>
          <Link className="action-link" to="/interview">All interviews</Link>
        </div>
        {alert}
      </>
    )
  }

  const waitText = WAITING[session.state]
  if (waitText) {
    return (
      <>
        <header className="page-head"><h1>Mock interview</h1></header>
        {alert}
        <Working text={waitText} />
      </>
    )
  }

  return (
    <>
      {alert}
      <InterviewRun
        session={session}
        busy={busy}
        hideText={hideText}
        onHideText={changeHide}
        act={async (action, extra) => { await post(action, extra) }}
        onLeave={() => navigate('/interview')}
      />
    </>
  )
}
