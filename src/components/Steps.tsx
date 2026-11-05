interface Props {
  items: string[]
  /** The index of the current item; items before it are done. `items.length` means all done. */
  at: number
  label?: string
}

/** The ordered steps of a flow: a check for done, an ink pill with an amber number for now, an outline circle later. */
export function Steps({ items, at, label }: Props) {
  return (
    <ol className="steps" aria-label={label ?? 'Steps'}>
      {items.map((item, i) => {
        const done = i < at
        const current = i === at
        return (
          <li key={`${i}-${item}`} className={done ? 'past' : current ? 'on' : ''} aria-current={current ? 'step' : undefined}>
            <span className="rounds-n" aria-hidden="true">{done ? '✓' : i + 1}</span>
            {item}
          </li>
        )
      })}
    </ol>
  )
}
