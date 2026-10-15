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

/**
 * Uploads one image file. Uses XMLHttpRequest rather than fetch because only it reports
 * upload progress. The file is sent as-is; the server checks what it really is.
 */
export function uploadFile<T>(path: string, file: File, onProgress?: (fraction: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `/api${path}`)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')
    xhr.setRequestHeader('X-Filename', encodeURIComponent(file.name))
    if (csrfToken) xhr.setRequestHeader('X-CSRF-Token', csrfToken)

    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total)
    xhr.onerror = () => reject(new ApiError(0, 'Could not reach the server. Check your connection and try again.'))
    xhr.onload = () => {
      let payload: { message?: string; errors?: Record<string, string>; data?: T } | null = null
      try {
        payload = JSON.parse(xhr.responseText)
      } catch {
        // not JSON (for example a proxy error page)
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        if (xhr.status === 401) onUnauthorized?.()
        const fallback =
          xhr.status === 413 ? 'This file is too large. Images can be up to 4 MB.' : 'The upload failed. Please try again.'
        reject(new ApiError(xhr.status, payload?.message ?? fallback, payload?.errors))
        return
      }
      onActivity?.()
      resolve(payload?.data as T)
    }
    xhr.send(file)
  })
}
