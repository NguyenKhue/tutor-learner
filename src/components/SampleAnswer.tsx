import { Markdown } from './Markdown'

/** A model answer to compare with, shown after grading when the grader wrote one. */
export function SampleAnswer({ text }: { text?: string }) {
  if (!text?.trim()) return null
  return (
    <section className="sample" aria-label="Sample answer">
      <div className="grade-label">Sample answer</div>
      <Markdown text={text} />
    </section>
  )
}
