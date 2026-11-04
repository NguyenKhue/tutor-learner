import type { PlannedQuestion, RoundKind } from './types'

/** A good spoken answer lasts from `[0]` to `[1]` seconds. */
export type Target = [number, number]

/** The default green zone of each round: HR answers are short, system design steps are long. */
export const ROUND_TARGET: Record<RoundKind, Target> = {
  hr: [45, 90],
  technical: [60, 150],
  system_design: [120, 240],
  behavioral: [90, 150],
}

/** A planner-given target is kept only when it is two whole seconds, 15 to 360, at least 20 apart. */
export function validTarget(v: unknown): Target | undefined {
  if (!Array.isArray(v) || v.length !== 2) return undefined
  const [a, b] = v
  if (!Number.isInteger(a) || !Number.isInteger(b)) return undefined
  if (a < 15 || b > 360 || b - a < 20) return undefined
  return [a, b]
}

/** The green zone for one question: its own when the plan gave one, else its round's. */
export function targetFor(kind: RoundKind | undefined, question?: Pick<PlannedQuestion, 'seconds'>): Target {
  return validTarget(question?.seconds) ?? ROUND_TARGET[kind ?? 'technical']
}

/** Recording stops by itself here: half as long again as the zone's end, in whole half-minutes, at least 2 minutes. */
export function recordLimit(t: Target): number {
  return Math.max(120, Math.ceil((t[1] * 1.5) / 30) * 30)
}

/** Where a length falls against the zone. */
export function zoneOf(seconds: number, t: Target): 'short' | 'good' | 'long' {
  if (seconds < t[0]) return 'short'
  return seconds <= t[1] ? 'good' : 'long'
}
