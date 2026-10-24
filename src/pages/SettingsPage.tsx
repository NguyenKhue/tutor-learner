import { useEffect, useState } from 'react'
import { api, ApiError } from '../api/client'
import { useTutorData } from '../hooks/useTutorData'
import type { Settings } from '../lib/types'

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

  if (!data) return <p className="hint">Loading…</p>

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

  return (
    <>
      <header className="page-head">
        <h1>Settings</h1>
      </header>

      <div className="form">
        {saveError !== null && (
          <div className="error-box" role="alert">
            {saveError.message}
          </div>
        )}

        <div className="panel">
          <div className="field">
            <label htmlFor="new-per-day">New points per day</label>
            <input
              id="new-per-day"
              type="number"
              className="mono"
              inputMode="numeric"
              min={1}
              max={10}
              value={perDay}
              onChange={(e) => setNewPerDay(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="reading-per-day">Reading reviews per day</label>
            <input
              id="reading-per-day"
              type="number"
              className="mono"
              inputMode="numeric"
              min={0}
              max={10}
              value={readingReviews}
              onChange={(e) => setReadingPerDay(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="english-feedback">English feedback</label>
            <input
              id="english-feedback"
              type="checkbox"
              checked={englishFeedback}
              onChange={(e) => setEnglish(e.target.checked)}
            />
          </div>
          <div className="row">
            <button type="button" className="btn primary" disabled={saving} onClick={() => void save()}>
              Save
            </button>
            {saved && <span className="hint">Saved</span>}
          </div>
        </div>

        <div className="panel">
          <div className="field">
            <label>Vault</label>
            <p className="hint mono">{data.vaultName}</p>
          </div>
          <div className="field">
            <label>Claude</label>
            <p className="hint">
              {claude?.lastError != null ? `Claude: last error — ${claude.lastError.message}` : 'Claude: OK'}
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
