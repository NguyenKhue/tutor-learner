import fs from 'node:fs'
import path from 'node:path'

/** Rejected vault path: it escapes the vault or carries an invalid point id. */
export class BadPath extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BadPath'
  }
}

const SKIP_DIRS = new Set(['.obsidian', '.git', 'node_modules', '.trash'])
const basenameCache = new Map<string, Map<string, string[]>>()

/** Resolves an Obsidian wikilink to an absolute vault path, or null when it is missing or unsafe. */
export function resolveWikilink(vault: string, link: string): string | null {
  const target = stripLink(link)
  if (!target || target.includes('\0')) return null
  const root = path.resolve(vault)
  const direct = path.join(root, /\.md$/i.test(target) ? target : `${target}.md`)
  if (containedFile(vault, direct)) return direct
  const name = path.basename(target.replace(/\.md$/i, ''))
  return findByBasename(root, name, false) ?? findByBasename(root, name, true)
}

/** Reads each link that resolves, reporting the rest as missing. */
export function readSources(
  vault: string,
  links: string[],
): { found: Array<{ link: string; path: string; text: string }>; missing: string[] } {
  const found: Array<{ link: string; path: string; text: string }> = []
  const missing: string[] = []
  for (const link of links) {
    const file = resolveWikilink(vault, link)
    if (!file) {
      missing.push(link)
      continue
    }
    found.push({ link, path: file, text: fs.readFileSync(file, 'utf8') })
  }
  return { found, missing }
}

/** Reads the question and scope lines from a point note, empty strings when absent. */
export function readPointText(vault: string, pointId: string): { question: string; scope: string } {
  const file = path.join(path.resolve(vault), 'Tutor', 'Points', `${validPointId(pointId)}.md`)
  const body = stripFrontmatter(fs.readFileSync(file, 'utf8'))
  return { question: labelled(body, '**Question:**'), scope: labelled(body, '**Scope:**') }
}

/** Maps a point id to its lesson note path inside the vault. */
export function lessonRelPath(pointId: string): string {
  return `Tutor/Lessons/${validPointId(pointId)}.md`
}

/** Reads a lesson body without frontmatter, or null when the note does not exist. */
export function readLesson(vault: string, pointId: string): string | null {
  const file = path.join(path.resolve(vault), lessonRelPath(pointId))
  return fs.existsSync(file) ? stripFrontmatter(fs.readFileSync(file, 'utf8')) : null
}

/** Writes a lesson note atomically, refusing any path outside the real Tutor/Lessons folder. */
export function writeLesson(vault: string, pointId: string, markdown: string): void {
  const id = validPointId(pointId)
  const title = id.split('/')[1].replace(/^\d+\s+/, '')
  const root = fs.realpathSync(path.resolve(vault))
  const lessons = path.join(root, 'Tutor', 'Lessons')
  if (!fs.existsSync(lessons)) fs.mkdirSync(lessons, { recursive: true })
  if (realpathOrNull(lessons) !== lessons) throw new BadPath('Tutor/Lessons is not a real folder in the vault')

  const file = path.join(lessons, `${id}.md`)
  const dir = path.dirname(file)
  fs.mkdirSync(dir, { recursive: true })
  if (!inside(lessons, dir)) throw new BadPath('lesson folder escapes Tutor/Lessons')

  const text = `---\ntutor: lesson\npoint: "[[Tutor/Points/${id}|${title}]]"\n---\n\n${markdown}${
    markdown.endsWith('\n') ? '' : '\n'
  }`
  const tmp = `${file}.tmp-${process.pid}-${Math.random().toString(36).slice(2)}`
  try {
    fs.writeFileSync(tmp, text)
    fs.renameSync(tmp, file)
  } catch (err) {
    fs.rmSync(tmp, { force: true })
    throw err
  }
}

/** Builds an Obsidian open URL for a vault-relative note path (without the .md suffix). */
export function obsidianUrl(vaultName: string, relPath: string): string {
  const file = relPath.replace(/\.md$/, '')
  return `obsidian://open?vault=${encodeURIComponent(vaultName)}&file=${encodeURIComponent(file)}`
}

function stripLink(link: string): string {
  return link
    .trim()
    .replace(/^\[\[/, '')
    .replace(/\]\]$/, '')
    .split(/[#|]/)[0]
    .trim()
}

function validPointId(pointId: string): string {
  const fail = (why: string): never => {
    throw new BadPath(`invalid point id ${JSON.stringify(pointId)}: ${why}`)
  }
  if (!pointId) return fail('empty')
  if (path.isAbsolute(pointId)) return fail('absolute')
  if (pointId.includes('\\')) return fail('backslash')
  if (pointId.includes('\0')) return fail('NUL')
  const parts = pointId.split('/')
  if (parts.length !== 2 || parts.some((p) => !p || p === '.' || p === '..')) {
    return fail('expected <topic>/<name>')
  }
  return pointId
}

function stripFrontmatter(text: string): string {
  const match = /^---\r?\n[\s\S]*?\r?\n---[ \t]*\r?\n?/.exec(text)
  return match ? text.slice(match[0].length).replace(/^\r?\n/, '') : text
}

function labelled(body: string, label: string): string {
  const line = body.split(/\r?\n/).find((l) => l.startsWith(label))
  return line ? line.slice(label.length).trim() : ''
}

function inside(base: string, target: string): boolean {
  const real = realpathOrNull(target)
  return real !== null && (real === base || real.startsWith(base + path.sep))
}

function containedFile(vault: string, file: string): boolean {
  try {
    const real = fs.realpathSync(file)
    const root = fs.realpathSync(vault)
    return fs.statSync(real).isFile() && (real === root || real.startsWith(root + path.sep))
  } catch {
    return false
  }
}

function realpathOrNull(target: string): string | null {
  try {
    return fs.realpathSync(target)
  } catch {
    return null
  }
}

function findByBasename(root: string, name: string, rebuild: boolean): string | null {
  for (const rel of indexFor(root, rebuild).get(name) ?? []) {
    const file = path.join(root, rel)
    if (containedFile(root, file)) return file
  }
  return null
}

function indexFor(root: string, rebuild: boolean): Map<string, string[]> {
  const cached = basenameCache.get(root)
  if (cached && !rebuild) return cached
  const index = new Map<string, string[]>()
  for (const rel of walk(root).sort()) {
    const base = path.basename(rel, '.md')
    const list = index.get(base)
    if (list) list.push(rel)
    else index.set(base, [rel])
  }
  basenameCache.set(root, index)
  return index
}

function walk(root: string, rel = ''): string[] {
  try {
    const out: string[] = []
    for (const entry of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) out.push(...walk(root, childRel))
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        out.push(childRel)
      }
    }
    return out
  } catch {
    return []
  }
}
