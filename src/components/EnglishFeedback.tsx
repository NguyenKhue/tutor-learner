import type { Attempt } from '../lib/types'

/** The English writing-feedback panel, shown only when the attempt carries English notes. */
export function EnglishFeedback({ attempt }: { attempt: Attempt }) {
  const english = attempt.english
  if (!english) return null
  return (
    <section className="english" aria-labelledby="english-h">
      <h3 id="english-h">English</h3>
      <div className="eng-row">
        <span className="grade-label">You wrote</span>
        <span>{attempt.answer}</span>
      </div>
      <div className="eng-row">
        <span className="grade-label">Better</span>
        <span>{english.corrected}</span>
      </div>
      {english.notes.length > 0 && (
        <ul>
          {english.notes.map((note) => <li key={note}>{note}</li>)}
        </ul>
      )}
    </section>
  )
}
