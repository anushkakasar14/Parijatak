import { useCallback, useEffect, useState } from 'react'
import { api } from '../services/api'

/** Responses already fetched during this visit, so moving between pages is instant. */
const memory = new Map<string, unknown>()

/** Requests in progress, so two components asking for the same thing share one call. */
const inFlight = new Map<string, Promise<unknown>>()

function load<T>(path: string): Promise<T> {
  let request = inFlight.get(path) as Promise<T> | undefined
  if (!request) {
    request = api<T>(path).finally(() => inFlight.delete(path))
    inFlight.set(path, request)
  }
  return request
}

const STORAGE_PREFIX = 'parijatak:content:'

function readStored<T>(path: string): T | undefined {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + path)
    return raw ? (JSON.parse(raw) as T) : undefined
  } catch {
    return undefined
  }
}

function store(path: string, value: unknown) {
  try {
    localStorage.setItem(STORAGE_PREFIX + path, JSON.stringify(value))
  } catch {
    // Storage full or unavailable (private browsing) — the site works without it.
  }
}

interface Options {
  /**
   * Keep the last good response in the browser and show it immediately on the next visit
   * and during an outage. Only for public, slow-changing text such as page wording and
   * contact details — never for products or slides, where "no longer published" must
   * take effect at once.
   */
  remember?: boolean
}

export interface Resource<T> {
  data: T | undefined
  /** `loading`: nothing to show yet. `ready`: `data` is set. `error`: the request failed and there is nothing to show. */
  status: 'loading' | 'ready' | 'error'
  retry: () => void
}

/** Loads public content from the API. */
export function useResource<T>(path: string, { remember = false }: Options = {}): Resource<T> {
  const initial = () =>
    (memory.get(path) as T | undefined) ?? (remember ? readStored<T>(path) : undefined)

  const [data, setData] = useState<T | undefined>(initial)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    setFailed(false)
    setData(initial())

    // Fetched once per visit; a retry always goes to the network.
    if (memory.has(path) && attempt === 0) return

    load<T>(path)
      .then((result) => {
        memory.set(path, result)
        if (remember) store(path, result)
        if (!cancelled) setData(result)
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })

    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, attempt])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  return {
    data,
    status: data !== undefined ? 'ready' : failed ? 'error' : 'loading',
    retry,
  }
}
