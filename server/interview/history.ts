import type { InterviewSession, RoundKind, WeakSpot } from '../../src/lib/types'

export interface WeakSpotSummary {
  key: string
  kind: WeakSpot['kind']
  label: string
  sessions: number
  lastSeen: string
  trend: 'still' | 'improving'
}

/** Questions Khue should be asked again in these rounds. Stub until Task 7. */
export function reaskQueue(_sessions: InterviewSession[], _today: string, _rounds: RoundKind[]): { round: RoundKind; prompt: string }[] {
  return []
}

/** Weak spots across sessions. Stub until Task 7. */
export function summarizeWeakSpots(_sessions: InterviewSession[]): WeakSpotSummary[] {
  return []
}

/** Keys of weak spots seen before. Stub until Task 7. */
export function knownWeakKeys(_sessions: InterviewSession[]): string[] {
  return []
}
