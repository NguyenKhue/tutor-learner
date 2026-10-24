import type { Overview, Point } from '../lib/types'

export function makePoint(id: string, over: Partial<Point> = {}): Point {
  const [topic, name] = id.split('/')
  return {
    id, topic, type: 'concept', interview: false, order: Number(name.slice(0, 2)) || 1, sources: [],
    status: 'new', mastery: 0, box: null, next_review: null, history: [], ...over,
  }
}

export function makeOverview(over: Partial<Overview> = {}): Overview {
  return {
    today: '2026-10-22',
    export: {
      generated: '2026-10-22',
      config: { interview_date: '2027-01-07', interview_buffer_days: 3, threshold: 0.8, daily_review_cap: 10 },
      points: [],
      skipped: [],
    },
    topicOrder: [],
    list: { date: '2026-10-22', review: [], fresh: [], extra: [] },
    settings: { newPerDay: 3, englishFeedback: true, readingReviewsPerDay: 3 },
    vaultName: 'Khue Vault',
    ...over,
  }
}
