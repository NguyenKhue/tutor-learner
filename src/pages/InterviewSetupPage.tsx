import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { Skeleton, Working } from '../components/Loading'
import { useTutorData } from '../hooks/useTutorData'
import { defaultTopics, ROUND_LABEL } from '../lib/interview'
import type { InterviewSession, Level, RoundKind } from '../lib/types'

const LEVELS: [Level, string][] = [['mid', 'Mid'], ['senior', 'Senior'], ['lead', 'Lead']]
const ROUNDS = Object.keys(ROUND_LABEL) as RoundKind[]

/** Setup form: job description, level, rounds, topics and two toggles, then prepare the interview. */
export function InterviewSetupPage() {
  const { data } = useTutorData()
  const navigate = useNavigate()
  const [source, setSource] = useState('')
  const [level, setLevel] = useState<Level>('senior')
  const [rounds, setRounds] = useState<RoundKind[]>(ROUNDS)
  const [topics, setTopics] = useState<string[]>([])
  const [web, setWeb] = useState(false)
  const [readAloud, setReadAloud] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const seeded = useRef(false)
  const touched = useRef(false) // set once Khue changes a topic chip by hand: the job description stops picking topics

  useEffect(() => {
    if (data && !seeded.current) {
      seeded.current = true
      setTopics(defaultTopics('', data.topicOrder, data.export.points))
    }
  }, [data])

  if (!data) return <Skeleton />

  const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item])

  async function prepare() {
    if (!data) return
    setBusy(true)
    setError('')
    try {
      const s = await api.post<InterviewSession>('/api/interview', {
        source, level,
        rounds: ROUNDS.filter((r) => rounds.includes(r)),
        topics: data.topicOrder.filter((t) => topics.includes(t)),
        web, readAloud,
      })
      navigate(`/interview/${encodeURIComponent(s.id)}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not prepare the interview.')
      setBusy(false)
    }
  }

  return (
    <>
      <header className="page-head">
        <h1>New mock interview</h1>
      </header>
      <form className="setup" onSubmit={(e) => { e.preventDefault(); void prepare() }}>
        <div className="field">
          <label htmlFor="jd">Job description or notes</label>
          <textarea
            id="jd" rows={7} value={source}
            onChange={(e) => setSource(e.target.value)}
            onBlur={() => { if (!touched.current) setTopics(defaultTopics(source, data.topicOrder, data.export.points)) }}
          />
          <p className="hint">Paste the job post. Topics below are picked from it.</p>
        </div>

        <fieldset className="field">
          <legend className="field-label">Level</legend>
          <div className="chips">
            {LEVELS.map(([value, label]) => (
              <button key={value} type="button" className="chip setup-chip" aria-pressed={level === value} onClick={() => setLevel(value)}>{label}</button>
            ))}
          </div>
        </fieldset>

        <fieldset className="field">
          <legend className="field-label">Rounds</legend>
          {ROUNDS.map((r) => (
            <label key={r} className="check">
              <input type="checkbox" checked={rounds.includes(r)} onChange={() => setRounds(toggle(rounds, r))} />
              {ROUND_LABEL[r]}
            </label>
          ))}
        </fieldset>

        <fieldset className="field">
          <legend className="field-label">Topics</legend>
          <div className="chips">
            {data.topicOrder.map((t) => (
              <button key={t} type="button" className="chip setup-chip" aria-pressed={topics.includes(t)} onClick={() => { touched.current = true; setTopics(toggle(topics, t)) }}>{t}</button>
            ))}
          </div>
        </fieldset>

        <div className="field">
          <label className="check"><input type="checkbox" checked={web} onChange={() => setWeb(!web)} />Search the web</label>
          <label className="check"><input type="checkbox" checked={readAloud} onChange={() => setReadAloud(!readAloud)} />Read questions aloud</label>
        </div>

        {error && <p className="hint" role="alert">{error}</p>}
        {busy ? (
          <Working text="Preparing your interview" />
        ) : (
          <button type="submit" className="btn primary wide" disabled={rounds.length === 0}>Prepare interview</button>
        )}
      </form>
    </>
  )
}
