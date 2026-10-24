import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/** One parsed block of lesson markdown. */
type Block =
  | { k: 'code'; code: string }
  | { k: 'h'; level: number; text: string }
  | { k: 'ul' | 'ol'; items: string[] }
  | { k: 'p'; text: string }
  | { k: 'quote'; blocks: Block[] }
  | { k: 'table'; rows: string[][] }

/** The inline spans this renderer knows: inline code, image embeds, wikilinks, bold, italic and links. */
const INLINE = /(`[^`]+`)|(!\[\[[^\]]+\]\]|!\[[^\]]*\]\([^)\s]+\))|(\[\[[^\]]+\]\])|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)\s]+\))/g

/** Where embeds and wikilinks point: images come from the vault through the API, links to notes the reader knows. */
export interface MarkdownLinks {
  notePath?: string
  resolveLink?: (target: string) => string | null
}

const cells = (line: string) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())

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
    if (/^\s*\|.*\|\s*$/.test(line)) {
      flush()
      const rows: string[][] = []
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[i])) rows.push(cells(lines[i]))
        i++
      }
      out.push({ k: 'table', rows })
      continue
    }
    if (line.startsWith('>')) {
      flush()
      const quote: string[] = []
      while (i < lines.length && lines[i].startsWith('>')) {
        quote.push(lines[i].replace(/^>\s?/, ''))
        i++
      }
      // an Obsidian callout header "[!info] Title" keeps only its title, as the first paragraph
      if (quote.length > 0) quote[0] = quote[0].replace(/^\[![^\]]+\][+-]?\s*/, '')
      if (quote.length > 0 && quote[0].trim() && quote.length > 1) quote.splice(1, 0, '')
      out.push({ k: 'quote', blocks: parseBlocks(quote.join('\n')) })
      continue
    }
    const head = line.match(/^(#{1,6})\s+(.*)$/)
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
function inline(text: string, links: MarkdownLinks = {}): ReactNode[] {
  const out: ReactNode[] = []
  let plain = 0
  let n = 0
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0
    if (at > plain) out.push(text.slice(plain, at))
    if (m[1]) out.push(<code key={n++}>{m[1].slice(1, -1)}</code>)
    else if (m[2]) {
      const src = m[2].startsWith('![[') ? m[2].slice(3, -2).split('|')[0] : (/\(([^)\s]+)\)$/.exec(m[2])?.[1] ?? '')
      if (links.notePath && !/^[a-z]+:/i.test(src))
        out.push(<img key={n++} alt={src} src={`/api/vault-image?note=${encodeURIComponent(links.notePath)}&src=${encodeURIComponent(src)}`} />)
      else out.push(<span key={n++}>{m[2]}</span>)
    } else if (m[3]) {
      const [target, alias] = m[3].slice(2, -2).split('|')
      const label = alias ?? target.split('#')[0].split('/').pop()
      const to = links.resolveLink?.(target.split('#')[0])
      out.push(to ? <Link key={n++} to={to}>{label}</Link> : <span key={n++}>{label}</span>)
    } else if (m[4]) out.push(<strong key={n++}>{m[4].slice(2, -2)}</strong>)
    else if (m[5]) out.push(<em key={n++}>{m[5].slice(1, -1)}</em>)
    else if (m[6]) {
      const link = /^\[([^\]]+)\]\((.+)\)$/.exec(m[6])
      const url = link?.[2] ?? ''
      const safe = /^(https?:\/\/|obsidian:)/.test(url)
      if (link && safe) out.push(<a key={n++} href={url}>{link[1]}</a>)
      else out.push(<span key={n++}>{m[6]}</span>)
    }
    plain = at + m[0].length
  }
  if (plain < text.length) out.push(text.slice(plain))
  return out
}

/** Renders one parsed block; the heading tag follows the `#` count. */
function block(b: Block, key: number, links: MarkdownLinks): ReactNode {
  const inline_ = (t: string) => inline(t, links)
  switch (b.k) {
    case 'code':
      return <pre key={key}><code>{b.code}</code></pre>
    case 'h': {
      const Tag = ['h1', 'h2', 'h3', 'h4'][Math.min(4, Math.max(1, b.level)) - 1] as 'h1' | 'h2' | 'h3' | 'h4'
      return <Tag key={key}>{inline_(b.text)}</Tag>
    }
    case 'ul':
      return (
        <ul key={key}>
          {b.items.map((it, i) => <li key={i}>{inline_(it)}</li>)}
        </ul>
      )
    case 'ol':
      return (
        <ol key={key}>
          {b.items.map((it, i) => <li key={i}>{inline_(it)}</li>)}
        </ol>
      )
    case 'p':
      return <p key={key}>{inline_(b.text)}</p>
    case 'quote':
      return <blockquote key={key}>{b.blocks.map((inner, i) => block(inner, i, links))}</blockquote>
    case 'table':
      return (
        <div className="table-wrap" key={key}>
          <table>
            <tbody>
              {b.rows.map((r, i) => (
                <tr key={i}>{r.map((c, j) => (i === 0 ? <th key={j}>{inline_(c)}</th> : <td key={j}>{inline_(c)}</td>))}</tr>
              ))}
            </tbody>
          </table>
        </div>
      )
  }
}

/** A small safe markdown renderer: no dangerouslySetInnerHTML and no dependencies. */
export function Markdown({ text, notePath, resolveLink }: { text: string } & MarkdownLinks) {
  const links = { notePath, resolveLink }
  return <div className="md">{parseBlocks(stripFrontmatter(text)).map((b, i) => block(b, i, links))}</div>
}

/** Drops a leading YAML frontmatter block so notes start at their content. */
function stripFrontmatter(text: string): string {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
}
