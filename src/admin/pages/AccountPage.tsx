import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, adminFetch } from '../api'
import { useAuth } from '../AuthContext'
import { Notice, PageHeader } from '../components'
import { cardClass, fieldClass, labelClass, primaryButtonClass } from '../ui'

function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErrors({})
    setMessage(null)
    setSaving(true)
    try {
      await adminFetch('/admin/auth/change-password', {
        method: 'POST',
        body: { currentPassword, newPassword },
      })
      setCurrentPassword('')
      setNewPassword('')
      setMessage({ kind: 'ok', text: 'Password changed. Other devices have been signed out.' })
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors)
      setMessage({
        kind: 'error',
        text: err instanceof ApiError ? err.message : 'Something went wrong. Please try again.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className={`${cardClass} space-y-4`}>
      <h2 className="font-sans text-lg font-medium text-stone-900">Change password</h2>

      {message && <Notice kind={message.kind}>{message.text}</Notice>}

      <div>
        <label htmlFor="current-password" className={labelClass}>
          Current password
        </label>
        <input
          id="current-password"
          type="password"
          autoComplete="current-password"
          required
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          aria-invalid={errors.currentPassword ? true : undefined}
          aria-describedby={errors.currentPassword ? 'current-password-error' : undefined}
          className={fieldClass}
        />
        {errors.currentPassword && (
          <p id="current-password-error" className="mt-1.5 text-sm text-red-700">
            {errors.currentPassword}
          </p>
        )}
      </div>

      <div>
        <label htmlFor="new-password" className={labelClass}>
          New password
        </label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          aria-invalid={errors.newPassword ? true : undefined}
          aria-describedby="new-password-hint"
          className={fieldClass}
        />
        <p id="new-password-hint" className="mt-1.5 text-sm text-stone-500">
          {errors.newPassword ? (
            <span className="text-red-700">{errors.newPassword}</span>
          ) : (
            'At least 12 characters. A few unrelated words works well.'
          )}
        </p>
      </div>

      <button type="submit" disabled={saving} className={primaryButtonClass}>
        {saving ? 'Saving…' : 'Change password'}
      </button>
    </form>
  )
}

export function AccountPage() {
  const { user } = useAuth()
  if (!user) return null

  return (
    <>
      <PageHeader title="Account" />
      <div className="grid max-w-4xl gap-6 lg:grid-cols-2">
        <section className={cardClass}>
          <h2 className="font-sans text-lg font-medium text-stone-900">Signed in as</h2>
          <dl className="mt-3 space-y-3">
            {[
              ['Name', user.name],
              ['Email', user.email],
              ['Access', user.role === 'admin' ? 'Admin — can make changes' : 'Viewer — can look, not change'],
            ].map(([term, value]) => (
              <div key={term}>
                <dt className="text-sm text-stone-500">{term}</dt>
                <dd className="break-all text-stone-900">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-sm text-stone-500">
            You are signed out automatically after a period of inactivity.
          </p>
        </section>

        <ChangePasswordForm />
      </div>
    </>
  )
}
