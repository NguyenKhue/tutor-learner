import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { api } from '../api/client'
import { Markdown } from '../components/Markdown'
import { ReadingQuiz } from '../components/ReadingQuiz'
import { useReading } from '../hooks/useReading'
import { useTutorData } from '../hooks/useTutorData'
import { obsidianUrl } from '../lib/format'
import type { CatalogEntry, ReadingQuiz as Quiz } from '../lib/types'

/** Read one note on the web, then take its quiz; a note due for a recheck goes straight to the quiz. */
export function ReadPage() {
  const { path = '' } = useParams()
  const { data: tutor, reload: reloadTutor } = useTutorData()
  const { data: reading, reload: reloadReading } = useReading()
  const [note, setNote] = useState<{ markdown: string; entry: CatalogEntry } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [loadingQuiz, setLoadingQuiz] = useState(false)

  useEffect(() => {
    setNote(null)
    setQuiz(null)
    api
      .get<{ markdown: string; entry: CatalogEntry }>(`/api/reading/note?path=${encodeURIComponent(path)}`)
      .then(setNote)
      .catch((e: Error) => setError(e.message))
  }, [path])

  const item = reading?.items.find((i) => i.path === path)
  const today = tutor?.today
  const dueNow = !!item && item.status === 'understood' && !!item.nextCheck && !!today && item.nextCheck <= today
  const resume = item?.openCheck ?? null

  const startQuiz = async () => {
    setLoadingQuiz(true)
    setError(null)
    try {
      setQuiz(await api.post<Quiz>('/api/reading/quiz', { path }))
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

  const resolveLink = (target: string) => {
    const name = target.split('/').pop()
    const hit = reading?.items.find((i) => i.present && (i.path === `${target}.md` || i.title === name))
    return hit ? `/read/${encodeURIComponent(hit.path)}` : null
  }

  if (error && !note) return <pre className="error-box">{error}</pre>
  if (!note) return <p className="hint">Loading…</p>

  return (
    <article className="reader">
      <header className="page-head">
        <div className="eyebrow">{note.entry.topic ?? 'Note'}</div>
        <h1>{note.entry.title}</h1>
        {note.entry.why && <p>{note.entry.why}</p>}
        {tutor && <a href={obsidianUrl(tutor.vaultName, path)}>Open in Obsidian</a>}
      </header>
      {error && <div className="error-box" role="alert">{error}</div>}
      {quiz ? (
        <ReadingQuiz
          path={path}
          quiz={quiz}
          initial={resume}
          onGraded={() => {
            void reloadReading()
            void reloadTutor()
          }}
        />
      ) : (
        <>
          <Markdown text={note.markdown} notePath={path} resolveLink={resolveLink} />
          <div className="foot">
            <button type="button" className="btn primary" disabled={loadingQuiz} onClick={() => void startQuiz()}>
              I've read it
            </button>
            {loadingQuiz && <span className="hint">Preparing questions…</span>}
          </div>
        </>
      )}
    </article>
  )
}
