import type { Point } from './types'

const DAY = 86_400_000
const toDay = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / DAY
const fromDay = (n: number) => new Date(n * DAY).toISOString().slice(0, 10)

/** Number of history entries (answers, from the web or the terminal) per day. */
export function activityByDay(points: Point[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const p of points) for (const h of p.history) out.set(h.d, (out.get(h.d) ?? 0) + 1)
  return out
}

/** Days in a row with at least one answer, ending today, or yesterday while today is still empty. */
export function streak(points: Point[], today: string): number {
  const days = activityByDay(points)
  let day = toDay(today)
  if (!days.has(today)) day -= 1
  let n = 0
  while (days.has(fromDay(day))) {
    n += 1
    day -= 1
  }
  return n
}

/** Points due on each of the next `days` days; anything overdue counts on today. */
export function dueForecast(points: Point[], today: string, days = 14): Array<{ date: string; count: number }> {
  const start = toDay(today)
  const out = Array.from({ length: days }, (_, i) => ({ date: fromDay(start + i), count: 0 }))
  for (const p of points) {
    if (!p.next_review) continue
    const i = Math.max(0, toDay(p.next_review) - start)
    if (i < days) out[i].count += 1
  }
  return out
}

/** New points per day needed to finish everything `bufferWeeks` before the interview. */
export function pace(points: Point[], today: string, interviewDate: string | null, bufferWeeks = 4): { remaining: number; daysLeft: number; perDay: number | null } {
  const remaining = points.filter((p) => p.status !== 'mastered').length
  if (!interviewDate) return { remaining, daysLeft: 0, perDay: null }
  const daysLeft = Math.max(1, toDay(interviewDate) - toDay(today) - bufferWeeks * 7)
  return { remaining, daysLeft, perDay: Math.ceil(remaining / daysLeft) }
}

export interface TopicRow { topic: string; total: number; new: number; learning: number; mastered: number; interviewPending: number }

/** Status counts per topic, in topic_order, then the unlisted topics by name. */
export function topicSummary(points: Point[], topicOrder: string[]): TopicRow[] {
  const rows = new Map<string, TopicRow>()
  for (const p of points) {
    const row = rows.get(p.topic) ?? { topic: p.topic, total: 0, new: 0, learning: 0, mastered: 0, interviewPending: 0 }
    row.total += 1
    row[p.status] += 1
    if (p.interview && p.status !== 'mastered') row.interviewPending += 1
    rows.set(p.topic, row)
  }
  const rank = (t: string) => (topicOrder.includes(t) ? topicOrder.indexOf(t) : topicOrder.length)
  return [...rows.values()].sort((a, b) => rank(a.topic) - rank(b.topic) || a.topic.localeCompare(b.topic))
}
