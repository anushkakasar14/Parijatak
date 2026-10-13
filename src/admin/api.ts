/**
 * API client for the admin panel.
 *
 * Authentication is an HttpOnly session cookie that this code can neither read nor
 * store. The CSRF token is kept in memory only — never in localStorage, sessionStorage
 * or the bundle — and is fetched again from the server after a page refresh.
 */

export class ApiError extends Error {
  readonly status: number
  readonly errors?: Record<string, string>

  constructor(status: number, message: string, errors?: Record<string, string>) {
    super(message)
    this.status = status
    this.errors = errors
  }
}

let csrfToken: string | null = null
let onUnauthorized: (() => void) | null = null
let onActivity: (() => void) | null = null

export function setCsrfToken(token: string | null) {
  csrfToken = token
}

/** Lets the auth context react when the server says the session is gone, or still alive. */
export function setSessionListeners(listeners: { unauthorized: () => void; activity: () => void } | null) {
  onUnauthorized = listeners?.unauthorized ?? null
  onActivity = listeners?.activity ?? null
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  /** Set false for calls where a 401 is an expected answer (the initial session check, sign-in). */
  notifyOnUnauthorized?: boolean
  /** Return the whole response body instead of just its `data` field. */
  raw?: boolean
}

export async function adminFetch<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, notifyOnUnauthorized = true, raw = false } = options

  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (method !== 'GET' && csrfToken) headers['X-CSRF-Token'] = csrfToken

  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers,
      // Same-origin only: the session cookie is never sent to another site.
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.')
  }

  const payload = (await response.json().catch(() => null)) as {
    success?: boolean
    message?: string
    errors?: Record<string, string>
    data?: T
  } | null

  if (!response.ok) {
    if (response.status === 401 && notifyOnUnauthorized) onUnauthorized?.()
    throw new ApiError(
      response.status,
      payload?.message ?? 'Something went wrong. Please try again.',
      payload?.errors,
    )
  }

  onActivity?.()
  return (raw ? payload : (payload?.data ?? payload)) as T
}
