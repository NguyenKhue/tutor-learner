import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type { CatalogEntry } from '../../src/lib/types'
import { BadPath } from '../vault'

/** Notes longer than this are whole-book dumps that already exist split by chapter. */
export const MAX_NOTE_CHARS = 60_000
const SKIP_TOP = new Set(['Tutor'])
const SKIP_ANY = new Set(['.claude', '.obsidian', '.git', '.trash', 'node_modules'])

export interface ScannedNote { path: string; title: string; chars: number; mtime: number; hash: string }

/** Reading the whole vault on every request is cheap only if unchanged files are not hashed again. */
const cache = new Map<string, { mtime: number; size: number; chars: number; hash: string }>()

/** Every note the Reading tab may suggest: .md files outside Tutor/ and hidden folders, at most 60,000 characters. */
export function scanVault(vault: string): ScannedNote[] {
  const out: ScannedNote[] = []
  const walk = (rel: string) => {
    for (const e of fs.readdirSync(path.join(vault, rel), { withFileTypes: true })) {
      const child = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory()) {
        if (!SKIP_ANY.has(e.name) && !(rel === '' && SKIP_TOP.has(e.name))) walk(child)
      } else if (e.isFile() && e.name.endsWith('.md')) {
        const note = describe(vault, child)
        if (note.chars <= MAX_NOTE_CHARS) out.push(note)
      }
    }
  }
  walk('')
  return out.sort((a, b) => (a.path < b.path ? -1 : 1))
}

function describe(vault: string, rel: string): ScannedNote {
  const file = path.join(vault, rel)
  const st = fs.statSync(file)
  let hit = cache.get(file)
  if (!hit || hit.mtime !== st.mtimeMs || hit.size !== st.size) {
    const text = fs.readFileSync(file, 'utf8')
    hit = { mtime: st.mtimeMs, size: st.size, chars: text.length, hash: crypto.createHash('sha1').update(text).digest('hex') }
    cache.set(file, hit)
  }
  return { path: rel, title: path.basename(rel, '.md'), chars: hit.chars, mtime: hit.mtime, hash: hit.hash }
}

/** Updates the catalog from a scan: keeps classification, marks vanished notes not present, sets isSource. */
export function mergeCatalog(old: Record<string, CatalogEntry>, scanned: ScannedNote[], sources: Set<string>): Record<string, CatalogEntry> {
  const next: Record<string, CatalogEntry> = {}
  for (const [p, e] of Object.entries(old)) next[p] = { ...e, present: false }
  for (const n of scanned) next[n.path] = { ...next[n.path], ...n, isSource: sources.has(n.path), present: true }
  return next
}

/** The text of one catalog note; refuses anything that is not a readable note inside the vault. */
export function readNoteText(vault: string, rel: string): string {
  const parts = rel.split('/')
  if (!rel.endsWith('.md') || path.isAbsolute(rel) || rel.includes('\\') || rel.includes('\0') || parts.some((p) => !p || p === '.' || p === '..')) {
    throw new BadPath(`not a note: ${rel}`)
  }
  if (SKIP_TOP.has(parts[0]) || parts.some((p) => SKIP_ANY.has(p))) throw new BadPath(`not a reading note: ${rel}`)
  const root = fs.realpathSync(vault)
  let real: string
  try {
    real = fs.realpathSync(path.join(root, rel))
  } catch {
    throw new BadPath(`no such note: ${rel}`)
  }
  if (real !== path.join(root, rel)) throw new BadPath(`note is a link: ${rel}`)
  return fs.readFileSync(real, 'utf8')
}
