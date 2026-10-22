import fs from 'node:fs'
import path from 'node:path'

/** Reads the topic_order array from Tutor/Roadmap.md frontmatter, [] when absent or invalid. */
export function readTopicOrder(vault: string): string[] {
  let text: string
  try {
    text = fs.readFileSync(path.join(path.resolve(vault), 'Tutor', 'Roadmap.md'), 'utf8')
  } catch {
    return []
  }
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)?.[1] ?? ''
  const line = frontmatter.split(/\r?\n/).find((l) => /^\s*topic_order\s*:/.test(l))
  if (!line) return []
  return parseStringArray(line.slice(line.indexOf(':') + 1).trim())
}

function parseStringArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value)
    return Array.isArray(parsed) && parsed.every((item) => typeof item === 'string') ? parsed : []
  } catch {
    return []
  }
}
