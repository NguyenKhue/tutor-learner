import type { ReadingCheck, ReadingStatus, TutorConfig } from './types'

const DAY = 86_400_000
const addDays = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * DAY).toISOString().slice(0, 10)

/** Days until the next check for each rung reached by consecutive passes. */
const PASS_GAP = [0, 7, 21]
const REREAD_GAP = 2
const DONE_RUNG = 3

/** The last day a check may be scheduled: interview date minus the buffer, like tutor.py. */
export function interviewCap(config: TutorConfig): string | null {
  return config.interview_date ? addDays(config.interview_date, -config.interview_buffer_days) : null
}

/**
 * Status, rung and next check of a note, replayed from its graded checks.
 * The rung counts passes since the last failure; dates never go past `cap` (or today when the cap has passed).
 */
export function deriveReading(checks: ReadingCheck[], today: string, cap: string | null): { status: ReadingStatus; rung: number; nextCheck: string | null } {
  const graded = checks.filter((c) => c.state === 'graded' && c.passed !== undefined)
  if (graded.length === 0) return { status: 'unread', rung: 0, nextCheck: null }
  let rung = 0
  for (const c of graded) rung = c.passed ? rung + 1 : 0
  const last = graded[graded.length - 1]
  if (rung >= DONE_RUNG) return { status: 'done', rung: DONE_RUNG, nextCheck: null }
  let next = addDays(last.date, rung === 0 ? REREAD_GAP : PASS_GAP[rung])
  if (cap) next = cap < today ? today : next > cap ? cap : next
  return { status: rung === 0 ? 'reread' : 'understood', rung, nextCheck: next }
}
