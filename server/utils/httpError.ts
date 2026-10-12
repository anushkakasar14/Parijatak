/** An error whose message is safe to show to API clients. */
export class HttpError extends Error {
  readonly status: number
  /** Optional per-field validation messages. */
  readonly errors?: Record<string, string>

  constructor(status: number, message: string, errors?: Record<string, string>) {
    super(message)
    this.status = status
    this.errors = errors
  }
}
