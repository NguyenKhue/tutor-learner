import type { ReactNode } from 'react'

/** One parsed block of lesson markdown. */
type Block =
  | { k: 'code'; code: string }
  | { k: 'h'; level: number; text: string }
  | { k: 'ul' | 'ol'; items: string[] }
  | { k: 'p'; text: string }

/** The inline spans this renderer knows: inline code, bold, italic and links. */
const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)\s]+\))/g

/** Splits `src` into blocks: headings, bullet/numbered lists, fenced code and paragraphs. */
function parseBlocks(src: string): Block[] {
  const lines = src.split('\n')
  const out: Block[] = []
  let para: string[] = []
  const flush = () => {
    if (para.length > 0) out.push({ k: 'p', text: para.join(' ') })
    para = []
  }
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (line.startsWith('```')) {
      flush()
      const code: string[] = []
      i++ // skip the opening fence
      while (i < lines.length && !lines[i].startsWith('```')) {
        code.push(lines[i])
        i++
      }
      i++ // skip the closing fence
      out.push({ k: 'code', code: code.join('\n') })
      continue
    }
    const head = line.match(/^(#{1,4})\s+(.*)$/)
    if (head) {
      flush()
      out.push({ k: 'h', level: head[1].length, text: head[2] })
      i++
      continue
    }
    const bullet = line.match(/^[-*]\s+(.*)$/)
    if (bullet) {
      flush()
      const items = [bullet[1]]
      i++
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ''))
        i++
      }
      out.push({ k: 'ul', items })
      continue
    }
    const numbered = line.match(/^\d+\.\s+(.*)$/)
    if (numbered) {
      flush()
      const items = [numbered[1]]
      i++
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ''))
        i++
      }
      out.push({ k: 'ol', items })
      continue
    }
    if (line.trim() === '') {
      flush()
      i++
      continue
    }
    para.push(line)
    i++
  }
  flush()
  return out
}

/** Renders one line's inline markdown as React nodes; only http(s) and obsidian: links become <a>. */
function inline(text: string): ReactNode[] {
  const out: ReactNode[] = []
  let plain = 0
  let n = 0
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0
    if (at > plain) out.push(text.slice(plain, at))
    if (m[1]) out.push(<code key={n++}>{m[1].slice(1, -1)}</code>)
    else if (m[2]) out.push(<strong key={n++}>{m[2].slice(2, -2)}</strong>)
    else if (m[3]) out.push(<em key={n++}>{m[3].slice(1, -1)}</em>)
    else if (m[4]) {
      const link = /^\[([^\]]+)\]\((.+)\)$/.exec(m[4])
      const url = link?.[2] ?? ''
      const safe = /^(https?:\/\/|obsidian:)/.test(url)
      if (link && safe) out.push(<a key={n++} href={url}>{link[1]}</a>)
      else out.push(<span key={n++}>{m[4]}</span>)
    }
    plain = at + m[0].length
  }
  if (plain < text.length) out.push(text.slice(plain))
  return out
}

/** Renders one parsed block; the heading tag follows the `#` count. */
function block(b: Block, key: number): ReactNode {
  switch (b.k) {
    case 'code':
      return <pre key={key}><code>{b.code}</code></pre>
    case 'h': {
      const Tag = ['h1', 'h2', 'h3', 'h4'][Math.min(4, Math.max(1, b.level)) - 1] as 'h1' | 'h2' | 'h3' | 'h4'
      return <Tag key={key}>{inline(b.text)}</Tag>
    }
    case 'ul':
      return (
        <ul key={key}>
          {b.items.map((it, i) => <li key={i}>{inline(it)}</li>)}
        </ul>
      )
    case 'ol':
      return (
        <ol key={key}>
          {b.items.map((it, i) => <li key={i}>{inline(it)}</li>)}
        </ol>
      )
    case 'p':
      return <p key={key}>{inline(b.text)}</p>
  }
}

/** A small safe markdown renderer: no dangerouslySetInnerHTML and no dependencies. */
export function Markdown({ text }: { text: string }) {
  return <div className="md">{parseBlocks(text).map((b, i) => block(b, i))}</div>
}
