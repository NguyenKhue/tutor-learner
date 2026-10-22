import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { HistoryEntry, PointType } from '../src/lib/types'

/** The real tutor.py, copied into every test vault so tests run the same scoring code as the CLI tutor. */
export const REAL_TUTOR_PY = '/Users/khue/Obsidian/Khue Vault/.claude/skills/tutor/scripts/tutor.py'

export interface TestPoint {
  topic: string
  name: string
  type: PointType
  order: number
  interview?: boolean
  sources?: string[]
  history?: HistoryEntry[]
}

const q = (s: string) => JSON.stringify(s)

function pointNote(p: TestPoint): string {
  const history = p.history ?? []
  const lines = [
    '---',
    'tutor: "point"',
    `topic: ${q(p.topic)}`,
    `type: ${q(p.type)}`,
    `interview: ${p.interview ?? false}`,
    `order: ${p.order}`,
    `sources: ${JSON.stringify(p.sources ?? [])}`,
    'status: "new"',
    'mastery: 0.0',
    'box: null',
    'next_review: null',
    history.length ? 'history:' : 'history: []',
    ...history.map((h) => `  - ${JSON.stringify(h)}`),
    '---',
    `**Question:** What is ${p.name}?`,
    '',
    `**Scope:** Scope of ${p.name}.`,
    '',
  ]
  return lines.join('\n')
}

/** A temp vault with Tutor/config.md, Tutor/Roadmap.md, point notes and the real tutor.py. */
export function makeTestVault(
  points: TestPoint[],
  opts: { topicOrder?: string[]; files?: Record<string, string> } = {},
): { vault: string; cleanup(): void } {
  const vault = fs.mkdtempSync(path.join(os.tmpdir(), 'tutor-vault-'))
  const write = (rel: string, text: string) => {
    const file = path.join(vault, rel)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, text)
  }
  write('.claude/skills/tutor/scripts/tutor.py', fs.readFileSync(REAL_TUTOR_PY, 'utf8'))
  write(
    'Tutor/config.md',
    '---\ntutor: config\ninterview_date: 2027-01-07\ninterview_buffer_days: 3\nthreshold: 0.8\ndaily_review_cap: 10\n---\n',
  )
  const topicOrder = opts.topicOrder ?? [...new Set(points.map((p) => p.topic))]
  write('Tutor/Roadmap.md', `---\ntutor: roadmap\ntopic_order: ${JSON.stringify(topicOrder)}\n---\n\n# Roadmap\n`)
  for (const p of points) write(`Tutor/Points/${p.topic}/${p.name}.md`, pointNote(p))
  for (const [rel, text] of Object.entries(opts.files ?? {})) write(rel, text)
  return { vault, cleanup: () => fs.rmSync(vault, { recursive: true, force: true }) }
}
