import type { Point, RoundKind } from './types'

/** How many questions each round asks (a system design round is one problem in 4 steps). */
export const ROUND_SIZE: Record<RoundKind, number> = { hr: 5, technical: 5, system_design: 4, behavioral: 4 }

export const ROUND_LABEL: Record<RoundKind, string> = {
  hr: 'HR',
  technical: 'Technical',
  system_design: 'System design',
  behavioral: 'Behavioral / Lead',
}

/** Topic words too general to pick a topic on their own ("programming language" is not "Kotlin Language"). */
const GENERIC = new Set(['language', 'languages', 'and', 'design', 'system', 'systems', 'data', 'computer', 'science', 'testing'])
const escapeRegex = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Topics whose name words (4+ letters, not generic) appear as whole words in `source`; if none do, topics with a started point. */
export function defaultTopics(source: string, topicOrder: string[], points: Point[]): string[] {
  const text = source.toLowerCase()
  const matched = topicOrder.filter((topic) =>
    topic.toLowerCase().split(/[^a-z0-9]+/).some((w) => w.length >= 4 && !GENERIC.has(w) && new RegExp(`\\b${escapeRegex(w)}\\b`).test(text)))
  if (matched.length) return matched
  return topicOrder.filter((topic) => points.some((p) => p.topic === topic && p.status !== 'new'))
}
