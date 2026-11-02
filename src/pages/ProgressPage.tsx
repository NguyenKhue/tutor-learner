import { useMemo } from 'react'
import { ActivityCalendar, type Activity } from 'react-activity-calendar'
import { Link } from 'react-router-dom'
import { useTutorData } from '../hooks/useTutorData'
import { daysBetween } from '../lib/day'
import { activityByDay, dueForecast, pace, streak } from '../lib/stats'
import type { Overview, Point } from '../lib/types'
import { Skeleton } from '../components/Loading'

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

  const planned = data.settings.newPerDay
  const behind = paceInfo.perDay !== null && paceInfo.perDay > planned
  const interviewDays = data.export.config.interview_date ? daysBetween(today, data.export.config.interview_date) : null
  const anyDue = forecast.some((d) => d.count > 0)

  return (
    <>
      <header className="page-head">
        <h1>Progress</h1>
      </header>

      {paceInfo.perDay === null ? (
        <p className="hint">No interview date set.</p>
      ) : (
        <div className={behind ? 'pace behind' : 'pace'}>
          <b>{behind ? 'Behind pace' : 'On track'}</b>
          <p>{`You plan ${planned} new ${planned === 1 ? 'point' : 'points'} a day. You need about ${paceInfo.perDay} to finish 4 weeks before the interview.`}</p>
          {behind && <Link className="btn primary" to="/settings">Change daily goal</Link>}
        </div>
      )}

      <div className="stat-tiles">
        <div className="tile-stat"><b>{`${mastered} / ${points.length}`}</b><span>mastered</span></div>
        {interviewDays !== null && <div className="tile-stat"><b>{interviewDays}</b><span>days left</span></div>}
        <div className="tile-stat"><b>{streak(points, today)}</b><span>day streak</span></div>
      </div>

      <section aria-labelledby="activity-h">
        <h2 id="activity-h">Your answers</h2>
        <ActivityCalendar
          data={heat}
          tooltips={TOOLTIPS}
          theme={{ light: HEAT, dark: HEAT }}
          showWeekdayLabels={['mon', 'wed', 'fri']}
          labels={{ totalCount: '{{count}} answers so far' }}
          fontSize={11}
          blockSize={11}
          blockMargin={2}
        />
      </section>

      {anyDue && (
        <section aria-labelledby="forecast-h">
          <h2 id="forecast-h">Reviews coming up</h2>
          <div className="bars" role="list" aria-label="Reviews coming up">
            {forecast.map((day) => (
              <div key={day.date} role="listitem" aria-label={`${day.date}: ${day.count} due`}>
                <b>{day.count || ''}</b>
                <i style={{ height: `${barHeight(day.count)}px` }} />
                <span>{day.date.slice(8)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  )
}

/** The progress page: waits for the overview, then renders the derived stats. */
export function ProgressPage() {
  const { data } = useTutorData()
  if (!data) return <Skeleton />
  return <Progress data={data} />
}
