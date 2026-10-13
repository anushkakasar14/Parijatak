import { useState } from 'react'
import type { FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { ApiError } from './api'
import { useAuth } from './AuthContext'
import { fieldClass, labelClass, primaryButtonClass } from './ui'

export function LoginPage() {
  const { status, sessionExpired, login } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (status === 'signedIn') {
    const from = (location.state as { from?: string } | null)?.from
    return <Navigate to={from?.startsWith('/admin') ? from : '/admin'} replace />
  }

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)
    try {
      await login(email, password)
    } catch (err) {
      setPassword('')
      setError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="grid min-h-svh place-items-center px-4 py-10">
      <div className="w-full max-w-sm">
        <p className="text-center text-sm font-medium tracking-[0.18em] text-teal uppercase">
          Parijatak
        </p>
        <h1 className="mt-2 text-center font-sans text-2xl font-medium text-slate-900">
          Admin sign in
        </h1>

        <form
          onSubmit={onSubmit}
          className="mt-8 space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
        >
          {sessionExpired && !error && (
            <p role="status" className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Your session ended. Please sign in again.
            </p>
          )}
          {error && (
            <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}

          <div>
            <label htmlFor="admin-email" className={labelClass}>
              Email
            </label>
            <input
              id="admin-email"
              type="email"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={fieldClass}
            />
          </div>

          <div>
            <label htmlFor="admin-password" className={labelClass}>
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={fieldClass}
            />
          </div>

          <button
            type="submit"
            disabled={submitting || status === 'loading'}
            className={`${primaryButtonClass} w-full`}
          >
            {submitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-500">
          Forgotten your password? Ask the site owner to reset it.
        </p>
      </div>
    </main>
  )
}
