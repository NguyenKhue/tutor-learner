import { useEffect, useState } from 'react'
import { api, ApiError } from '../api/client'
import { useTutorData } from '../hooks/useTutorData'
import { THEMES, saveTheme, storedTheme } from '../lib/theme'
import type { Settings } from '../lib/types'
import { Skeleton } from '../components/Loading'

/** The part of GET /api/health this page reads. */
interface Health {
  claude: { lastError: { code?: string; message: string } | null } | null
}

const asMsg = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** A whole number 0-10 from the input, or the saved value when the input is not a number. */
const clampReading = (value: string, fallback: number) => {
  const n = Number(value)
  return value.trim() !== '' && Number.isFinite(n) ? Math.min(10, Math.max(0, Math.round(n))) : fallback
}

/** Settings: the per-day amount and English feedback (POSTed to the server), plus read-only status. */
export function SettingsPage() {
  const { data, reload } = useTutorData()

  // null means untouched, so the input follows data.settings until the user edits it.
  const [newPerDay, setNewPerDay] = useState<string | null>(null)
  const [english, setEnglish] = useState<boolean | null>(null)
  const [readingPerDay, setReadingPerDay] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<ApiError | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const [theme, setTheme] = useState(storedTheme)

  useEffect(() => {
    let on = true
    void api
      .get<Health>('/api/health')
      .then((h) => {
        if (on) setHealth(h)
      })
      .catch(() => {
        // status is best effort; nothing to alert about
      })
    return () => {
      on = false
    }
  }, [])

  if (!data) return <Skeleton />

  const perDay = newPerDay ?? String(data.settings.newPerDay)
  const englishFeedback = english ?? data.settings.englishFeedback
  const readingReviews = readingPerDay ?? String(data.settings.readingReviewsPerDay ?? 3)
  const claude = health?.claude

  /** POSTs both settings, then refetches the overview so the whole app follows. */
  const save = async () => {
    setSaving(true)
    setSaveError(null)
    const n = Number(perDay)
    try {
      await api.post<Settings>('/api/settings', {
        newPerDay: Number.isFinite(n) ? Math.min(10, Math.max(1, Math.round(n))) : data.settings.newPerDay,
        englishFeedback,
        readingReviewsPerDay: clampReading(readingReviews, data.settings.readingReviewsPerDay ?? 3),
      })
      await reload()
      setSaved(true)
    } catch (e) {
      setSaveError(e instanceof ApiError ? e : new ApiError(asMsg(e), 0))
    } finally {
      setSaving(false)
    }
  }

  /** Moves a number box by one step, kept inside its min and max. */
  const step = (value: string, by: number, min: number, max: number, set: (v: string) => void) => {
    const n = Number(value)
    set(String(Math.min(max, Math.max(min, (Number.isFinite(n) ? Math.round(n) : min) + by))))
    setSaved(false)
  }

  return (
    <div className="settings read-col">
      <header className="page-head">
        <h1>Settings</h1>
      </header>

      {saveError !== null && (
        <div className="error-box" role="alert">
          {saveError.message}
        </div>
      )}

      <section className="card settings-card" aria-labelledby="study-h">
        <h2 id="study-h">Daily study</h2>
        <div className="setting-row">
          <div className="setting-text">
            <label htmlFor="new-per-day">New points per day</label>
            <p className="hint">New points added to Today, from 1 to 10.</p>
          </div>
          <div className="stepper">
            <button type="button" className="btn" aria-label="Fewer new points per day" onClick={() => step(perDay, -1, 1, 10, setNewPerDay)}>−</button>
            <input
              id="new-per-day"
              type="number"
              inputMode="numeric"
              min={1}
              max={10}
              value={perDay}
              onChange={(e) => setNewPerDay(e.target.value)}
            />
            <button type="button" className="btn" aria-label="More new points per day" onClick={() => step(perDay, 1, 1, 10, setNewPerDay)}>+</button>
          </div>
        </div>
        <div className="setting-row">
          <div className="setting-text">
            <label htmlFor="reading-per-day">Reading reviews per day</label>
            <p className="hint">Notes to recheck, on top of new reading.</p>
          </div>
          <div className="stepper">
            <button type="button" className="btn" aria-label="Fewer reading reviews per day" onClick={() => step(readingReviews, -1, 0, 10, setReadingPerDay)}>−</button>
            <input
              id="reading-per-day"
              type="number"
              inputMode="numeric"
              min={0}
              max={10}
              value={readingReviews}
              onChange={(e) => setReadingPerDay(e.target.value)}
            />
            <button type="button" className="btn" aria-label="More reading reviews per day" onClick={() => step(readingReviews, 1, 0, 10, setReadingPerDay)}>+</button>
          </div>
        </div>
        <div className="setting-row">
          <div className="setting-text">
            <label htmlFor="english-feedback">English feedback</label>
            <p className="hint">Notes on grammar and wording after each answer.</p>
          </div>
          <input
            id="english-feedback"
            className="switch"
            type="checkbox"
            checked={englishFeedback}
            onChange={(e) => setEnglish(e.target.checked)}
          />
        </div>
        <div className="setting-save">
          <button type="button" className="btn primary" disabled={saving} onClick={() => void save()}>
            Save
          </button>
          {saved && <span className="hint saved">Saved</span>}
        </div>
      </section>

      <section className="card settings-card setting-row" aria-labelledby="theme-h">
        <div className="setting-text">
          <h2 id="theme-h">Theme</h2>
          <p className="hint">Changes right away.</p>
        </div>
        <span className="theme" role="group" aria-label="Theme">
          {THEMES.map(([t, label]) => (
            <button
              key={t}
              type="button"
              aria-pressed={theme === t}
              onClick={() => {
                setTheme(t)
                saveTheme(t)
              }}
            >
              {label}
            </button>
          ))}
        </span>
      </section>

      <section className="card settings-card" aria-labelledby="connected-h">
        <h2 id="connected-h">Connected</h2>
        <div className="setting-row">
          <span className="setting-name">Vault</span>
          <span className="hint mono">{data.vaultName}</span>
        </div>
        <div className="setting-row">
          <span className="setting-name">Claude</span>
          <span className="hint">
            {claude?.lastError != null ? `Last error: ${claude.lastError.message}` : <><i className="ok-dot" aria-hidden="true" />OK</>}
          </span>
        </div>
      </section>
    </div>
  )
}
