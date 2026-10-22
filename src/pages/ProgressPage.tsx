import { useMemo } from 'react'
import { ActivityCalendar, type Activity } from 'react-activity-calendar'
import { useTutorData } from '../hooks/useTutorData'
import { activityByDay, dueForecast, pace, streak } from '../lib/stats'
import type { Overview, Point } from '../lib/types'

const HEAT_START = '2026-10-07'
const DAY = 86_400_000

/** The accent scale straight from the CSS tokens, so the calendar follows the app theme. */
const HEAT = ['var(--heat-0)', 'var(--heat-1)', 'var(--heat-2)', 'var(--heat-3)', 'var(--heat-4)']

/** GitHub-style: "2 answers on Oct 21, 2026". */
const dayTooltip = ({ count, date }: Activity) =>
  `${count === 0 ? 'No' : count} ${count === 1 ? 'answer' : 'answers'} on ${new Date(
    `${date}T00:00:00Z`,
  ).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`
const TOOLTIPS = { activity: { text: dayTooltip, withArrow: true, hoverRestMs: 0 } }

/** Answers per day from 2026-10-07 up to today; level 0–4 tracks the count. */
function heatData(points: Point[], today: string): Activity[] {
  const counts = activityByDay(points)
  const out: Activity[] = []
  for (let t = Date.parse(`${HEAT_START}T00:00:00Z`), end = Date.parse(`${today}T00:00:00Z`); t <= end; t += DAY) {
    const date = new Date(t).toISOString().slice(0, 10)
    const count = counts.get(date) ?? 0
    out.push({ date, count, level: Math.min(4, Math.max(0, count)) })
  }
  return out
}

/** Everything the progress page shows, derived from the shared overview. */
function Progress({ data }: { data: Overview }) {
  const points = data.export.points
  const today = data.today

  const heat = useMemo(() => heatData(points, today), [points, today])
  const forecast = useMemo(() => dueForecast(points, today), [points, today])
  const paceInfo = useMemo(() => pace(points, today, data.export.config.interview_date), [points, today, data.export.config.interview_date])

  const mastered = points.filter((p) => p.status === 'mastered').length
  // px, not %: a percentage height inside the auto-sized bar row collapses to the minimum.
  const peak = Math.max(1, ...forecast.map((d) => d.count))
  const barHeight = (count: number) => Math.round((count / peak) * 100)

  return (
    <>
      <header className="page-head">
        <h1>Progress</h1>
        <p>Derived from your answer history.</p>
      </header>

      <section aria-labelledby="activity-h">
        <h2 id="activity-h">Answers so far</h2>
        <ActivityCalendar
          data={heat}
          tooltips={TOOLTIPS}
          theme={{ light: HEAT, dark: HEAT }}
          showWeekdayLabels={['mon', 'wed', 'fri']}
          labels={{ totalCount: '{{count}} answers in the last two weeks' }}
          fontSize={11}
          blockSize={11}
          blockMargin={2}
        />
        <div className="heatrow">
          <div className="stat">
            <b>{`${mastered} / ${points.length} mastered`}</b>
          </div>
          <div className="stat">
            <b>{`${streak(points, today)}-day streak`}</b>
          </div>
        </div>
      </section>

      <section aria-labelledby="forecast-h">
        <h2 id="forecast-h">Due forecast</h2>
        <p className="hint">
          {`Points coming due from ${forecast[0]?.date ?? today} to ${forecast[forecast.length - 1]?.date ?? today}.`}
        </p>
        <div className="bars" role="list" aria-label="Due forecast">
          {forecast.map((day) => (
            <div key={day.date} role="listitem" aria-label={`${day.date}: ${day.count} due`}>
              <b>{day.count}</b>
              <i style={{ height: `${barHeight(day.count)}px` }} />
              <span>{day.date.slice(8)}</span>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="pace-h">
        <h2 id="pace-h">Interview pace</h2>
        {paceInfo.perDay !== null ? (
          <p className="hint">
            {`About ${paceInfo.perDay} new ${paceInfo.perDay === 1 ? 'point' : 'points'} a day to finish 4 weeks before the interview.`}
          </p>
        ) : (
          <p className="hint">No interview date set.</p>
        )}
      </section>
    </>
  )
}

/** The progress page: waits for the overview, then renders the derived stats. */
export function ProgressPage() {
  const { data } = useTutorData()
  if (!data) return <p className="hint">Loading…</p>
  return <Progress data={data} />
}
