/** Set VITE_API_URL only when the API lives on a different origin from the site. */
const API_BASE = import.meta.env.VITE_API_URL ?? ''

const TIMEOUT_MS = 10_000

export class ApiError extends Error {
  readonly status: number
  /** Per-field messages from the server's validation, when there are any. */
  readonly errors?: Record<string, string>

  constructor(status: number, message: string, errors?: Record<string, string>) {
    super(message)
    this.status = status
    this.errors = errors
  }
}

interface Envelope<T> {
  success?: boolean
  message?: string
  errors?: Record<string, string>
  data?: T
}

/**
 * Calls the public API and returns the `data` part of its response. Throws ApiError for
 * anything else — including a server that is slow, unreachable or not returning JSON.
 */
export async function api<T>(path: string, init?: { method: 'POST'; body: unknown }): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/api${path}`, {
      method: init?.method ?? 'GET',
      headers: init ? { 'Content-Type': 'application/json' } : undefined,
      body: init ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch {
    throw new ApiError(0, 'Could not reach the server. Please check your connection and try again.')
  }

  const payload = (await response.json().catch(() => null)) as Envelope<T> | null

  if (!response.ok || !payload) {
    throw new ApiError(
      response.status,
      payload?.message ?? 'Something went wrong. Please try again later.',
      payload?.errors,
    )
  }
  return payload.data as T
}
