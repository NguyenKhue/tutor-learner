import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api/client'
import { Skeleton, Working } from '../components/Loading'
import { useTutorData } from '../hooks/useTutorData'
import { defaultTopics, ROUND_LABEL, ROUND_SIZE } from '../lib/interview'
import type { InterviewSession, Level, RoundKind } from '../lib/types'

const LEVELS: [Level, string, string][] = [
  ['mid', 'Mid', 'Builds features well, knows the platform.'],
  ['senior', 'Senior', 'Owns a part of the app, makes trade-offs, helps others.'],
  ['lead', 'Lead', 'Sets direction, weighs tech debt, grows the team.'],
]
const ROUND_NOTE: Record<RoundKind, string> = {
  hr: 'Motivation, salary, fit',
  technical: 'Applied questions, follow-ups',
  system_design: 'One problem in 4 steps',
  behavioral: 'Real stories, situation to result',
}
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

  const chosen = ROUNDS.filter((r) => rounds.includes(r))
  const questions = chosen.reduce((n, r) => n + ROUND_SIZE[r], 0)
  const levelName = LEVELS.find(([v]) => v === level)?.[1]

  return (
    <>
      <header className="page-head">
        <h1>New mock interview</h1>
        <p>Paste a job post. You get rounds like a real hiring process, then a debrief.</p>
      </header>
      <form className="setup" onSubmit={(e) => { e.preventDefault(); void prepare() }}>
        <div className="setup-main">
          <section className="setup-card">
            <label htmlFor="jd" className="setup-title">Job description or notes</label>
            <textarea
              id="jd" rows={7} value={source}
              placeholder="Paste the job post, an email from HR, or your own notes."
              onChange={(e) => setSource(e.target.value)}
              onBlur={() => { if (!touched.current) setTopics(defaultTopics(source, data.topicOrder, data.export.points)) }}
            />
            <fieldset>
              <legend className="setup-sub">Topics from your notes</legend>
              <p className="hint">Picked from the job post. Tap to change.</p>
              <div className="chips">
                {data.topicOrder.map((t) => (
                  <button key={t} type="button" className="chip setup-chip" aria-pressed={topics.includes(t)} onClick={() => { touched.current = true; setTopics(toggle(topics, t)) }}>{t}</button>
                ))}
              </div>
            </fieldset>
          </section>

          <fieldset className="setup-card">
            <legend className="setup-title">Level</legend>
            <div className="level-pick">
              {LEVELS.map(([value, label, note]) => (
                <label key={value} className={level === value ? 'level-card on' : 'level-card'}>
                  <input type="radio" name="level" aria-label={label} aria-describedby={`level-${value}`} checked={level === value} onChange={() => setLevel(value)} />
                  <span className="level-name" aria-hidden="true">{label}</span>
                  <span id={`level-${value}`} className="level-note">{note}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="setup-card">
            <legend className="setup-title">Rounds</legend>
            <p className="hint">They run in this order, like a real hiring process.</p>
            <ol className="round-pick">
              {ROUNDS.map((r, i) => (
                <li key={r}>
                  <label className={rounds.includes(r) ? 'round-card on' : 'round-card'}>
                    <input type="checkbox" aria-label={ROUND_LABEL[r]} aria-describedby={`round-${r}`} checked={rounds.includes(r)} onChange={() => setRounds(toggle(rounds, r))} />
                    <span className="rounds-n" aria-hidden="true">{i + 1}</span>
                    <span className="round-text">
                      <span aria-hidden="true">{ROUND_LABEL[r]}</span>
                      <span id={`round-${r}`} className="round-note">{ROUND_NOTE[r]}, {ROUND_SIZE[r]} questions</span>
                    </span>
                  </label>
                </li>
              ))}
            </ol>
          </fieldset>
        </div>

        <aside className="setup-aside" aria-label="Your interview">
          <h2>Your interview</h2>
          <p className="setup-sum">
            {chosen.length === 0 ? 'Pick at least one round.' : `${questions} questions in ${chosen.length} ${chosen.length === 1 ? 'round' : 'rounds'}, ${levelName} level.`}
          </p>
          <div className="setup-toggles">
            <label className="check-row"><input type="checkbox" checked={web} onChange={() => setWeb(!web)} />Search the web</label>
            <label className="check-row"><input type="checkbox" checked={readAloud} onChange={() => setReadAloud(!readAloud)} />Read questions aloud</label>
          </div>
          {error && <p className="setup-error" role="alert">{error}</p>}
          {busy ? (
            <Working text="Preparing your interview" />
          ) : (
            <button type="submit" className="btn amber wide" disabled={chosen.length === 0}>Prepare my interview</button>
          )}
          <p className="setup-time">{web ? 'Takes about two minutes with the web search.' : 'Takes about a minute.'}</p>
        </aside>
      </form>
    </>
  )
}
