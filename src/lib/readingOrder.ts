import type { ReadingItem } from './types'

const PRIORITY = { high: 0, medium: 1, low: 2, skip: 3 } as const
const cmp = (a: string | number, b: string | number) => (a < b ? -1 : a > b ? 1 : 0)

/**
 * What to read next: unread notes from today's topics, then studied topics, then the rest (each in topic_order);
 * inside a group by priority, non-source notes first, shorter first, then path.
 */
export function upNext(items: ReadingItem[], todayTopics: string[], studiedTopics: string[], topicOrder: string[], n = 3): string[] {
  const group = (topic: string) => (todayTopics.includes(topic) ? 0 : studiedTopics.includes(topic) ? 1 : 2)
  const rank = (topic: string) => (topicOrder.includes(topic) ? topicOrder.indexOf(topic) : topicOrder.length)
  return items
    .filter((i) => i.status === 'unread' && !i.skipped && i.present && i.topic && i.priority && i.priority !== 'skip')
    .sort((a, b) => {
      const ta = a.topic as string
      const tb = b.topic as string
      return (
        cmp(group(ta), group(tb)) ||
        cmp(rank(ta), rank(tb)) ||
        cmp(PRIORITY[a.priority!], PRIORITY[b.priority!]) ||
        cmp(Number(a.isSource), Number(b.isSource)) ||
        cmp(a.chars, b.chars) ||
        cmp(a.path, b.path)
      )
    })
    .slice(0, n)
    .map((i) => i.path)
}

/** Notes due for a recheck or a reread, most overdue first, then priority, then path. */
export function dueReading(items: ReadingItem[], today: string): string[] {
  return items
    .filter((i) => i.present && (i.status === 'understood' || i.status === 'reread') && i.nextCheck !== null && i.nextCheck <= today)
    .sort((a, b) => cmp(a.nextCheck!, b.nextCheck!) || cmp(PRIORITY[a.priority ?? 'medium'], PRIORITY[b.priority ?? 'medium']) || cmp(a.path, b.path))
    .map((i) => i.path)
}
