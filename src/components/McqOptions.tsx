import { useEffect, useRef } from 'react'

/** The four mcq buttons; keys 1-4 pick an option (ignored while typing in a textarea/input). */
export function McqOptions({ options, value, onChange }: {
  options: string[]
  value: number | null
  onChange(index: number): void
}) {
  const latest = useRef(onChange)
  latest.current = onChange

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target as HTMLElement | null
      if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return
      const i = '1234'.indexOf(e.key)
      if (i >= 0 && i < options.length) {
        e.preventDefault()
        latest.current(i)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [options.length])

  return (
    <div className="mcq">
      {options.slice(0, 4).map((option, i) => (
        <button key={i} type="button" aria-pressed={value === i} onClick={() => onChange(i)}>
          <span className="mcq-key">{`${'ABCD'[i]}.`}</span>{' '}{option}
        </button>
      ))}
    </div>
  )
}
