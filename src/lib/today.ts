import type { DuePoint, Point, TodayList } from './types'

/**
 * The next points to learn, in the same order as `tutor.py next`: unscheduled new or learning
 * points, by topic_order (unlisted topics last, by name), then order, interview first, then id.
 */
export function nextNewPoints(points: Point[], topicOrder: string[], n: number, exclude: Set<string>): string[] {
  const rank = (topic: string) => {
    const i = topicOrder.indexOf(topic)
    return i < 0 ? topicOrder.length : i
  }
  const cmp = (a: string | number, b: string | number) => (a < b ? -1 : a > b ? 1 : 0)
  return points
    .filter((p) => (p.status === 'new' || p.status === 'learning') && p.next_review === null && !exclude.has(p.id))
    .sort(
      (a, b) =>
        cmp(rank(a.topic), rank(b.topic)) ||
        cmp(a.topic, b.topic) ||
        cmp(a.order, b.order) ||
        cmp(Number(!a.interview), Number(!b.interview)) ||
        cmp(a.id, b.id),
    )
    .slice(0, n)
    .map((p) => p.id)
}

/** Today's list: the due reviews in tutor.py order up to `cap`, then `newPerDay` new points. */
export function buildToday(a: { date: string; due: DuePoint[]; points: Point[]; topicOrder: string[]; cap: number; newPerDay: number }): TodayList {
  const review = a.due.slice(0, a.cap).map((d) => d.point)
  const fresh = nextNewPoints(a.points, a.topicOrder, a.newPerDay, new Set(review))
  return { date: a.date, review, fresh, extra: [] }
}

/** Keeps the list locked for the rest of its day; builds a new one on a new day. */
export function ensureToday(prev: TodayList | null, build: () => TodayList, date: string): TodayList {
  return prev && prev.date === date ? prev : build()
}

/** Adds one optional item: the first due point not on the list, else the next new point. */
export function addExtra(list: TodayList, points: Point[], topicOrder: string[], due: DuePoint[]): TodayList {
  const listed = new Set([...list.review, ...list.fresh, ...list.extra])
  const next = due.find((d) => !listed.has(d.point))?.point ?? nextNewPoints(points, topicOrder, 1, listed)[0]
  return next ? { ...list, extra: [...list.extra, next] } : list
}

/** A point counts as done today once its history has an entry dated today (web or terminal). */
export function itemDone(point: Point, date: string): boolean {
  return point.history.some((h) => h.d === date)
}
