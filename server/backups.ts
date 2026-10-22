import fs from 'node:fs'
import path from 'node:path'

const BACKUP_NAME = /^state-(\d{4})-(\d{2})-(\d{2})\.json$/
/** Whatever the clock says, this many of the newest backups are never removed (a wrong date must not wipe the history). */
const ALWAYS_KEEP = 7
const DAILY_DAYS = 14
const WEEKLY_DAYS = 8 * 7

const pad = (n: number) => String(n).padStart(2, '0')
const formatDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const dayNumber = (d: Date) => Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000)

/**
 * Copies state.json into `backupsDir` once per local day and prunes old copies
 * (14 daily, 8 weekly Sundays, never the newest 7).
 */
export function runBackups(stateFile: string, backupsDir: string, now: number): { created: string | null; removed: string[] } {
  fs.mkdirSync(backupsDir, { recursive: true })
  const today = new Date(now)
  const todayNumber = dayNumber(today)
  const name = `state-${formatDate(today)}.json`
  let created: string | null = null

  if (fs.existsSync(stateFile) && !fs.existsSync(path.join(backupsDir, name))) {
    fs.copyFileSync(stateFile, path.join(backupsDir, name))
    created = name
  }

  const entries = fs.readdirSync(backupsDir).filter((e) => BACKUP_NAME.test(e))
  const newest = new Set([...entries].sort().reverse().slice(0, ALWAYS_KEEP))
  const removed: string[] = []
  for (const entry of entries) {
    if (entry === name || newest.has(entry)) continue
    const m = BACKUP_NAME.exec(entry)!
    const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
    const age = todayNumber - dayNumber(date)
    const daily = age >= 0 && age < DAILY_DAYS
    const weekly = date.getDay() === 0 && age >= 0 && age < WEEKLY_DAYS
    if (daily || weekly) continue
    const file = path.join(backupsDir, entry)
    if (!fs.statSync(file).isFile()) continue
    fs.rmSync(file, { force: true })
    removed.push(entry)
  }
  return { created, removed: removed.sort() }
}
