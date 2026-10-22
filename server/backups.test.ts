import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { runBackups } from './backups'

let dir: string
let stateFile: string
let backupsDir: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tutor-backups-'))
  stateFile = path.join(dir, 'state.json')
  backupsDir = path.join(dir, 'backups')
})
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }))

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime()
const names = () => fs.readdirSync(backupsDir).sort()

test('copies state.json once per local day', () => {
  fs.writeFileSync(stateFile, '{"v":1}')
  expect(runBackups(stateFile, backupsDir, at(2026, 10, 20))).toEqual({ created: 'state-2026-10-20.json', removed: [] })
  fs.writeFileSync(stateFile, '{"v":2}')
  expect(runBackups(stateFile, backupsDir, at(2026, 10, 20)).created).toBeNull()
  // the first copy of the day is kept, not refreshed
  expect(fs.readFileSync(path.join(backupsDir, 'state-2026-10-20.json'), 'utf8')).toBe('{"v":1}')
  expect(runBackups(stateFile, backupsDir, at(2026, 10, 21)).created).toBe('state-2026-10-21.json')
})

test('does nothing before there is any data', () => {
  expect(runBackups(stateFile, backupsDir, at(2026, 10, 20))).toEqual({ created: null, removed: [] })
  expect(names()).toEqual([])
})

test('keeps 14 daily copies and Sundays for 8 weeks, removes the rest', () => {
  fs.writeFileSync(stateFile, '{}')
  fs.mkdirSync(backupsDir)
  // 2026-07-01 … 2026-10-19: one copy per day
  for (let t = at(2026, 7, 1); t < at(2026, 10, 20); t += 86_400_000) {
    const d = new Date(t)
    const name = `state-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`
    fs.writeFileSync(path.join(backupsDir, name), '{}')
  }
  fs.writeFileSync(path.join(backupsDir, 'notes.txt'), 'mine')

  runBackups(stateFile, backupsDir, at(2026, 10, 20))
  const kept = names()
  // today + the 13 days before it
  for (let d = 7; d <= 20; d++) expect(kept).toContain(`state-2026-10-${String(d).padStart(2, '0')}.json`)
  expect(kept).not.toContain('state-2026-10-06.json')
  // an older Sunday inside 8 weeks stays, an older weekday goes
  expect(kept).toContain('state-2026-09-06.json')
  expect(kept).not.toContain('state-2026-09-07.json')
  // Sundays older than 8 weeks go
  expect(kept).not.toContain('state-2026-07-05.json')
  // files that are not backups are never touched
  expect(kept).toContain('notes.txt')
})

test('never removes the newest 7 copies, even when the clock is far ahead', () => {
  fs.mkdirSync(backupsDir)
  for (let d = 1; d <= 9; d++) fs.writeFileSync(path.join(backupsDir, `state-2026-01-0${d}.json`), '{}')
  const { removed } = runBackups(stateFile, backupsDir, at(2030, 1, 1))
  expect(removed).toEqual(['state-2026-01-01.json', 'state-2026-01-02.json'])
  expect(names()).toHaveLength(7)
})
