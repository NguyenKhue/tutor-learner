/** The local calendar date (YYYY-MM-DD) in `tz`; tutor.py uses the same calendar day. */
export function localToday(tz = 'Asia/Ho_Chi_Minh', now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** Whole days from `from` to `to` (two YYYY-MM-DD dates, negative when `to` is earlier), computed in UTC. */
export function daysBetween(from: string, to: string): number {
  const utc = (d: string) => Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10)))
  return Math.round((utc(to) - utc(from)) / 86_400_000)
}
