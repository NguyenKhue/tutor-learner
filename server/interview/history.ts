import type { InterviewSession, RoundKind, WeakSpot } from '../../src/lib/types'

export interface WeakSpotSummary {
  key: string
  kind: WeakSpot['kind']
  label: string
  sessions: number
  lastSeen: string
  trend: 'still' | 'improving'
}

const MIN_DAYS = 3
const MAX_PER_ROUND = 2
const DAY = 86_400_000

/** `created` is a date or a full ISO time; only the day matters. */
const day = (s: InterviewSession) => s.created.slice(0, 10)

/** Sessions that have a report, oldest first (the stored order breaks ties). */
function reported(sessions: InterviewSession[]): InterviewSession[] {
  return sessions
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => s.report)
    .sort((a, b) => (day(a.s) < day(b.s) ? -1 : day(a.s) > day(b.s) ? 1 : a.i - b.i))
    .map(({ s }) => s)
}

/**
 * Main questions Khue should be asked again in these rounds. A question is weak when reasoning or depth is 2 or
 * less. It is due three days after its latest weak answer, and leaves the queue when a later re-ask (a planned
 * question with `reask` = the original prompt) scores 3 or more on both. At most two per round kind, oldest first.
 */
export function reaskQueue(sessions: InterviewSession[], today: string, rounds: RoundKind[]): { round: RoundKind; prompt: string }[] {
  const open = new Map<string, { round: RoundKind; prompt: string; date: string }>()
  for (const s of reported(sessions)) {
    for (const r of s.report!.questions) {
      const round = s.plan?.find((p) => p.questions.some((q) => q.q === r.q))
      const planned = round?.questions.find((q) => q.q === r.q)
      if (!round || !planned) continue
      const prompt = planned.reask ?? planned.prompt
      if (r.scores.reasoning <= 2 || r.scores.depth <= 2) {
        const prev = open.get(prompt)
        open.set(prompt, { round: prev?.round ?? round.kind, prompt, date: day(s) })
      } else if (planned.reask) {
        open.delete(prompt)
      }
    }
  }
  const taken = new Map<RoundKind, number>()
  const out: { round: RoundKind; prompt: string }[] = []
  const due = [...open.values()]
    .filter((o) => rounds.includes(o.round) && (Date.parse(today.slice(0, 10)) - Date.parse(o.date)) / DAY >= MIN_DAYS)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  for (const o of due) {
    const n = taken.get(o.round) ?? 0
    if (n >= MAX_PER_ROUND) continue
    taken.set(o.round, n + 1)
    out.push({ round: o.round, prompt: o.prompt })
  }
  return out
}

/** Weak spots that came back in at least two done sessions, most frequent first. */
export function summarizeWeakSpots(sessions: InterviewSession[]): WeakSpotSummary[] {
  const done = reported(sessions).filter((s) => s.state === 'done')
  if (done.length === 0) return []
  const newest = done[done.length - 1]
  const by = new Map<string, WeakSpotSummary>()
  for (const s of done) {
    for (const w of new Set(s.report!.weakSpots.map((x) => x.key))) {
      const spot = s.report!.weakSpots.find((x) => x.key === w)!
      const prev = by.get(w)
      by.set(w, { key: w, kind: spot.kind, label: spot.label, sessions: (prev?.sessions ?? 0) + 1, lastSeen: day(s), trend: 'still' })
    }
  }
  const latest = new Set(newest.report!.weakSpots.map((w) => w.key))
  return [...by.values()]
    .filter((w) => w.sessions >= 2)
    .map((w) => ({ ...w, trend: latest.has(w.key) ? ('still' as const) : ('improving' as const) }))
    .sort((a, b) => b.sessions - a.sessions)
}

/** Every weak-spot key ever reported, so the report prompt can reuse them. */
export function knownWeakKeys(sessions: InterviewSession[]): string[] {
  return [...new Set(reported(sessions).flatMap((s) => s.report!.weakSpots.map((w) => w.key)))]
}
