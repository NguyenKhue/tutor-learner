import type { Point, RoundKind } from './types'

export const ROUND_LABEL: Record<RoundKind, string> = {
  hr: 'HR',
  technical: 'Technical',
  system_design: 'System design',
  behavioral: 'Behavioral / Lead',
}

/** Topics whose name words (4+ letters) appear in `source`; if none do, topics with a started point. */
export function defaultTopics(source: string, topicOrder: string[], points: Point[]): string[] {
  const text = source.toLowerCase()
  const matched = topicOrder.filter((topic) =>
    topic.toLowerCase().split(/[^a-z0-9]+/).some((w) => w.length >= 4 && text.includes(w)))
  if (matched.length) return matched
  return topicOrder.filter((topic) => points.some((p) => p.topic === topic && p.status !== 'new'))
}
