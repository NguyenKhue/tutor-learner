/** The answer textarea; Cmd/Ctrl+Enter submits when an `onSubmit` handler is given. */
export function AnswerBox({ value, onChange, onSubmit, ariaLabel }: {
  value: string
  onChange(value: string): void
  onSubmit?: () => void
  ariaLabel?: string
}) {
  return (
    <textarea
      className="answer"
      rows={5}
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={
        onSubmit
          ? (e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                onSubmit()
              }
            }
          : undefined
      }
    />
  )
}
