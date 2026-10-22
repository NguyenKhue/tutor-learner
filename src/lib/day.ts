/** The local calendar date (YYYY-MM-DD) in `tz`; tutor.py uses the same calendar day. */
export function localToday(tz = 'Asia/Ho_Chi_Minh', now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}
