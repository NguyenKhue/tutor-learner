import { useEffect, useState, type ReactNode } from 'react'
import { api } from '../api/client'
import { Markdown } from './Markdown'

/** The lesson payload from the server. */
interface Lesson {
  markdown: string
  missingSources: string[]
  obsidianUrl: string
}

/** The lesson card: fetches and renders the point's lesson, with a link back into Obsidian. */
export function LessonView({ pointId, footer }: { pointId: string; footer?: ReactNode }) {
  const [lesson, setLesson] = useState<Lesson | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let on = true
    ;(async () => {
      try {
        const l = await api.get<Lesson>(`/api/lesson?point=${encodeURIComponent(pointId)}`)
        if (on) setLesson(l)
      } catch (e) {
        if (on) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      on = false
    }
  }, [pointId])

  return (
    <article className="lesson">
      {!lesson && !error && <p className="hint">Writing lesson…</p>}
      {error && <p className="lesson-error">{error}</p>}
      {lesson && (
        <>
          <div className="row spread">
            <span className="grade-label">Lesson</span>
            <a className="lesson-link" href={lesson.obsidianUrl}>Open in Obsidian</a>
          </div>
          <Markdown text={lesson.markdown} />
          {lesson.missingSources.length > 0 && (
            <div className="warn">
              <div>Missing source notes:</div>
              <ul>
                {lesson.missingSources.map((s) => <li key={s}>{s}</li>)}
              </ul>
            </div>
          )}
        </>
      )}
      {footer && <div className="row">{footer}</div>}
    </article>
  )
}
