/** A soft placeholder while a page's data arrives. */
export function Skeleton() {
  return (
    <div className="skeleton" role="status" aria-label="Loading">
      <span />
      <span />
      <span />
    </div>
  )
}

/** Moving dots with a few words, for the longer waits on Claude or Whisper. */
export function Working({ text }: { text: string }) {
  return (
    <span className="working" role="status">
      <span className="working-dots" aria-hidden="true"><i /><i /><i /></span>
      {text}
    </span>
  )
}
