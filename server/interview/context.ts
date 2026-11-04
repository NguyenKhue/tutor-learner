import type { CatalogEntry, NoteExcerpt } from '../../src/lib/types'
import { readNoteText } from '../reading/catalog'

export const CONTEXT_BUDGET = 40_000
export const EXCERPT_CHARS = 4_000

const ORDER = ['high', 'medium', 'low'] as const

function stripFrontmatter(text: string): string {
  const m = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(?:\r?\n|$)/.exec(text)
  return (m ? text.slice(m[0].length) : text).trim()
}

/** Excerpts of the notes Khue studied for the chosen topics, best-priority first, within a character budget. Read-only. */
export function buildVaultContext(
  vault: string,
  catalog: Record<string, CatalogEntry>,
  topics: string[],
  budget = CONTEXT_BUDGET,
): NoteExcerpt[] {
  const wanted = new Set(topics)
  const rank = (e: CatalogEntry) => ORDER.indexOf(e.priority as (typeof ORDER)[number])
  const entries = Object.values(catalog)
    .filter((e) => e.present && e.topic && wanted.has(e.topic) && rank(e) >= 0)
    .sort((a, b) => rank(a) - rank(b) || (a.path < b.path ? -1 : 1))
  const out: NoteExcerpt[] = []
  let used = 0
  for (const e of entries) {
    let text: string
    try {
      text = stripFrontmatter(readNoteText(vault, e.path)).slice(0, EXCERPT_CHARS)
    } catch {
      continue
    }
    if (!text) continue
    if (used + text.length > budget) break
    used += text.length
    out.push({ path: e.path, title: e.title, text })
  }
  return out
}
