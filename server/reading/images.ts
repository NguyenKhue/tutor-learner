import fs from 'node:fs'
import path from 'node:path'

const TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
}
const SKIP = new Set(['.git', '.obsidian', '.trash', 'node_modules'])
const byName = new Map<string, Map<string, string>>()

/**
 * The image an embed in `notePath` points to (`![[x.png]]` or `![](images/x.jpg)`): next to the note, then from the
 * vault root, then the first file with that name. Only image types, and only real files inside the vault.
 */
export function resolveVaultImage(vault: string, notePath: string, src: string): { file: string; type: string } | null {
  const target = decodeURIComponent(src.split(/[#?|]/)[0]).trim()
  const type = TYPES[path.extname(target).toLowerCase()]
  if (!type || !target || target.includes('\0') || path.isAbsolute(target)) return null
  const root = fs.realpathSync(vault)
  const candidates = [path.join(root, path.dirname(notePath), target), path.join(root, target)]
  const name = path.basename(target)
  const named = index(root).get(name) ?? (byName.delete(root), index(root).get(name))
  if (named) candidates.push(path.join(root, named))
  for (const c of candidates) {
    const real = realFile(c)
    if (real && real.startsWith(root + path.sep) && real === path.resolve(c)) return { file: real, type }
  }
  return null
}

function realFile(file: string): string | null {
  try {
    const real = fs.realpathSync(file)
    return fs.statSync(real).isFile() ? real : null
  } catch {
    return null
  }
}

function index(root: string): Map<string, string> {
  let map = byName.get(root)
  if (map) return map
  map = new Map()
  const walk = (rel: string) => {
    for (const e of fs.readdirSync(path.join(root, rel), { withFileTypes: true })) {
      const child = rel ? `${rel}/${e.name}` : e.name
      if (e.isDirectory() && !SKIP.has(e.name)) walk(child)
      else if (e.isFile() && TYPES[path.extname(e.name).toLowerCase()] && !map!.has(e.name)) map!.set(e.name, child)
    }
  }
  walk('')
  byName.set(root, map)
  return map
}
