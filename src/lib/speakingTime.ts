/** A good spoken interview answer lasts this long, in seconds. */
export const GOOD_FROM = 30
export const GOOD_TO = 60
/** Recording stops by itself here. */
export const MAX_SECONDS = 120

/** Formats seconds as m:ss. */
export function clock(seconds: number): string {
  const whole = Math.floor(seconds)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

/** The nudge shown while recording. */
export function timeHint(seconds: number): string {
  const whole = Math.floor(seconds)
  if (whole < GOOD_FROM) return `Keep going, ${GOOD_FROM - whole}s to the green zone`
  if (whole <= GOOD_TO) return 'Good length'
  return 'Time to wrap up'
}

/** One line on the length of a finished answer. */
export function lengthNote(seconds: number): string {
  const whole = Math.floor(seconds)
  if (whole < GOOD_FROM) return 'a bit short'
  return whole <= GOOD_TO ? 'good length' : 'a bit long'
}
