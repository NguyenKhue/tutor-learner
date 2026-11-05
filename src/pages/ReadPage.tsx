import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/client'
import { Markdown, headingsOf } from '../components/Markdown'
import { ReadingQuiz } from '../components/ReadingQuiz'
import { Steps } from '../components/Steps'
import { useReading } from '../hooks/useReading'
import { useTutorData } from '../hooks/useTutorData'
import { obsidianUrl } from '../lib/format'
import type { CatalogEntry, ReadingQuiz as Quiz } from '../lib/types'
import { Skeleton, Working } from '../components/Loading'

/** Read one note on the web, then take its quiz; a note due for a recheck goes straight to the quiz. */
export function ReadPage() {
  const { path = '' } = useParams()
  const { data: tutor, reload: reloadTutor } = useTutorData()
  const { data: reading, reload: reloadReading } = useReading()
  const [note, setNote] = useState<{ markdown: string; entry: CatalogEntry } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [loadingQuiz, setLoadingQuiz] = useState(false)
  const [quizOpen, setQuizOpen] = useState(false)
  const [graded, setGraded] = useState(false)
  const [readPct, setReadPct] = useState(0)
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    setNote(null)
    setQuiz(null)
    setQuizOpen(false)
    setGraded(false)
    setError(null)
    setReadPct(0)
    setActive(null)
    api
      .get<{ markdown: string; entry: CatalogEntry }>(`/api/reading/note?path=${encodeURIComponent(path)}`)
      .then(setNote)
      .catch((e: Error) => setError(e.message))
  }, [path])

  const item = reading?.items.find((i) => i.path === path)
  const today = tutor?.today
  const dueNow = !!item && item.status === 'understood' && !!item.nextCheck && !!today && item.nextCheck <= today
  const resume = item?.openCheck ?? null

  // A resumed check that is already graded opens on its result.
  useEffect(() => {
    if (resume?.state === 'graded') setGraded(true)
  }, [resume])

  const startQuiz = async () => {
    if (quiz) {
      setQuizOpen(true)
      return
    }
    setLoadingQuiz(true)
    setError(null)
    try {
      setQuiz(await api.post<Quiz>('/api/reading/quiz', { path }))
      setQuizOpen(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoadingQuiz(false)
    }
  }

  useEffect(() => {
    if ((dueNow || resume) && !quiz && !loadingQuiz) void startQuiz()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dueNow, resume])

  // Reading progress and the section nearest the top of the viewport.
  useEffect(() => {
    if (!note) return
    const heads = headingsOf(note.markdown)
    const update = () => {
      const root = document.documentElement
      const max = root.scrollHeight - window.innerHeight
      setReadPct(max > 0 ? Math.max(0, Math.min(100, Math.round((window.scrollY / max) * 100))) : 0)
      if (heads.length > 0) {
        let current = heads[0].id
        let nearest = Infinity
        for (const h of heads) {
          const el = document.getElementById(h.id)
          const top = el ? Math.abs(el.getBoundingClientRect().top) : Infinity
          if (top < nearest) {
            nearest = top
            current = h.id
          }
        }
        setActive(current)
      } else {
        setActive(null)
      }
    }
    window.addEventListener('scroll', update, { passive: true })
    window.addEventListener('resize', update)
    update()
    return () => {
      window.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [note, quizOpen])

  const resolveLink = (target: string) => {
    const name = target.split('/').pop()
    const hit = reading?.items.find((i) => i.present && (i.path === `${target}.md` || i.title === name))
    return hit ? `/read/${encodeURIComponent(hit.path)}` : null
  }

  if (error && !note) return <pre className="error-box">{error}</pre>
  if (!note) return <Skeleton />

  const headings = headingsOf(note.markdown)
  const at = graded ? 2 : quizOpen ? 1 : 0

  return (
    <article className={quizOpen ? 'reader quiz-view' : 'reader'}>
      <div className="read-top">
        {!quizOpen ? (
          <Link to="/reading" className="read-back">← Reading</Link>
        ) : graded ? null : (
          <button type="button" className="read-back" onClick={() => setQuizOpen(false)}>← Back to the note</button>
        )}
        <Steps items={['Read', 'Questions', 'Result']} at={at} />
      </div>

      {quiz && (
        <div hidden={!quizOpen}>
          <div className="quiz-stack">
            <section className="room quiz-head" aria-labelledby="read-quiz-h">
              <span className="room-eyebrow">{note.entry.title}</span>
              <h1 id="read-quiz-h">Three questions, from memory</h1>
              <p>Two right and it counts as understood.</p>
            </section>
            <ReadingQuiz
              path={path}
              quiz={quiz}
              initial={resume}
              onGraded={() => {
                setGraded(true)
                void reloadReading()
                void reloadTutor()
              }}
            />
          </div>
        </div>
      )}

      {!quizOpen && (
        <div className="work">
          <div className="work-main">
            <header className="read-head">
              <span className="read-topic">{note.entry.topic ?? 'Note'}</span>
              <h1>{note.entry.title}</h1>
              <div className="read-meta">
                {tutor && (
                  <a className="btn outline read-outline" href={obsidianUrl(tutor.vaultName, path)}>
                    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M14 3h7v7" />
                      <path d="M10 14 21 3" />
                      <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
                    </svg>
                    Open in Obsidian
                  </a>
                )}
                {note.entry.minutes ? <span>About {note.entry.minutes} minutes</span> : null}
                <span>Then 3 questions, about 3 minutes</span>
              </div>
            </header>

            <div className="card note-card">
              <Markdown text={note.markdown} notePath={path} resolveLink={resolveLink} />
            </div>

            {error && <div className="error-box" role="alert">{error}</div>}

            <section className="room done-room" aria-labelledby="done-h">
              <div>
                <h2 id="done-h">Done reading?</h2>
                <p>Three short questions, from memory. Two right and the note counts as understood.</p>
              </div>
              <button type="button" className="btn amber" disabled={loadingQuiz} onClick={() => void startQuiz()}>
                {quiz ? 'Back to the questions' : 'Answer 3 questions'}
              </button>
              {loadingQuiz && <Working text="Preparing questions" />}
            </section>
          </div>

          <aside className="work-aside">
            {headings.length > 0 && (
              <nav className="card toc" aria-label="On this page">
                <span className="toc-title">On this page</span>
                {headings.map((h) => (
                  <a
                    key={h.id}
                    href={`#${h.id}`}
                    aria-current={h.id === active ? 'location' : undefined}
                    className={h.id === active ? 'on' : undefined}
                  >
                    {h.text}
                  </a>
                ))}
              </nav>
            )}
            <section className="card finish-card" aria-labelledby="finish-h">
              <div className="finish-top">
                <h2 id="finish-h">When you finish</h2>
                <span className="finish-pct">{readPct}% read</span>
              </div>
              <span className="read-bar" aria-hidden="true"><i style={{ width: `${readPct}%` }} /></span>
              <p>Three questions from memory. The note hides while you answer.</p>
              <button
                type="button"
                className="btn outline"
                disabled={loadingQuiz}
                onClick={() => void startQuiz()}
              >
                Answer the questions
              </button>
            </section>
          </aside>
        </div>
      )}
    </article>
  )
}
