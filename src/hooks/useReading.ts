import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../api/client'
import type { ReadingOverview } from '../lib/types'

/** GET /api/reading, with a reload; polls every 3 s while classification runs. */
export function useReading() {
  const [data, setData] = useState<ReadingOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const reload = useCallback(async () => {
    try {
      setData(await api.get<ReadingOverview>('/api/reading'))
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : String(e))
    }
  }, [])
  useEffect(() => {
    void reload()
  }, [reload])
  useEffect(() => {
    if (!data?.classify.running) return
    const t = setTimeout(() => void reload(), 3000)
    return () => clearTimeout(t)
  }, [data, reload])
  return { data, error, reload, setData }
}
