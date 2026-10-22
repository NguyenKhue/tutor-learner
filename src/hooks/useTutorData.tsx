import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api, ApiError } from '../api/client'
import type { Overview, TodayList } from '../lib/types'

/** One shared server snapshot: the overview plus helpers to refetch or patch today's list. */
export interface TutorData {
  data: Overview | null
  error: ApiError | null
  loading: boolean
  reload(): Promise<void>
  setList(list: TodayList): void
}

const Ctx = createContext<TutorData | null>(null)

/** Normalizes any thrown value into an ApiError. */
const asApiError = (e: unknown) => (e instanceof ApiError ? e : new ApiError(e instanceof Error ? e.message : String(e), 0))

/** Provides the shared /api/overview copy: loads on mount and refetches on focus (throttled to 30 s). */
export function TutorDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<Overview | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(true)
  const loadedAt = useRef(0)

  /** Fetches the overview: this is both the mount load and `reload()` (which is never throttled). */
  const reload = useCallback(async () => {
    try {
      setData(await api.get<Overview>('/api/overview'))
      setError(null)
    } catch (e) {
      setError(asApiError(e))
    } finally {
      loadedAt.current = Date.now()
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void reload()
  }, [reload])

  useEffect(() => {
    // Refocus keeps the page fresh, but at most every 30 s.
    const onFocus = () => {
      if (Date.now() - loadedAt.current >= 30_000) void reload()
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [reload])

  /** Replaces today's list in the shared copy, e.g. after "Study one more". */
  const setList = useCallback((list: TodayList) => {
    setData((prev) => (prev ? { ...prev, list } : prev))
  }, [])

  const value = useMemo(() => ({ data, error, loading, reload, setList }), [data, error, loading, reload, setList])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/** Reads the shared tutor data from context (only usable inside TutorDataProvider). */
export function useTutorData(): TutorData {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTutorData must be used inside TutorDataProvider')
  return ctx
}
