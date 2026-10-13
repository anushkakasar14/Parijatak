import { useCallback, useEffect, useState } from 'react'
import { ApiError, adminFetch } from './api'

interface ApiState<T> {
  data: T | null
  error: string | null
  /** True for the first load and for every reload. */
  loading: boolean
  reload: () => void
  /** Replace the data locally after a successful change, without refetching. */
  setData: (updater: (current: T) => T) => void
}

/**
 * Loads `path` and reloads whenever it changes. With `raw`, the whole response body is
 * returned (needed for lists, whose pagination sits beside `data`).
 */
export function useApi<T>(path: string, options: { raw?: boolean } = {}): ApiState<T> {
  const { raw = false } = options
  const [data, setDataState] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    adminFetch<T>(path, { raw })
      .then((result) => !cancelled && setDataState(result))
      .catch((err) => {
        if (cancelled) return
        // A 401 is handled globally (the app returns to the login page).
        if (err instanceof ApiError && err.status === 401) return
        setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
      })
      .finally(() => !cancelled && setLoading(false))

    return () => {
      cancelled = true
    }
  }, [path, raw, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  const setData = useCallback(
    (updater: (current: T) => T) => setDataState((current) => (current ? updater(current) : current)),
    [],
  )

  return { data, error, loading, reload, setData }
}

/** Returns `value` only after it has stopped changing for `delayMs`. */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [value, delayMs])
  return debounced
}
