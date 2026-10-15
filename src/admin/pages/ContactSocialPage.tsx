import { useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import { ApiError, adminFetch } from '../api'
import { useAuth } from '../AuthContext'
import { ErrorNotice, LoadingBlock, Notice, PageHeader } from '../components'
import { TextArea, TextInput, useFormState } from '../forms'
import { useApi } from '../hooks'
import type { SiteSettings } from '../types'
import { cardClass, primaryButtonClass } from '../ui'

type Key = 'brand' | 'contact' | 'social' | 'footer'

/** One settings group with its own Save button, so each saves independently. */
function SettingsCard<T extends object>({
  settingKey,
  title,
  description,
  initial,
  toBody = (v) => v,
  canEdit,
  children,
}: {
  settingKey: Key
  title: string
  description?: string
  initial: T
  toBody?: (values: T) => unknown
  canEdit: boolean
  children: (form: { values: T; set: <K extends keyof T>(key: K) => (value: T[K]) => void; errors: Record<string, string> }) => ReactNode
}) {
  const { values, set, dirty, markSaved } = useFormState(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [result, setResult] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setErrors({})
    setResult(null)
    try {
      await adminFetch(`/admin/settings/${settingKey}`, { method: 'PUT', body: toBody(values) })
      markSaved()
      setResult({ kind: 'ok', text: 'Saved. The website uses these details from the next page visit.' })
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors)
      setResult({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not save.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className={`${cardClass} space-y-4`}>
      <div>
        <h2 className="font-sans text-lg font-medium text-stone-900">{title}</h2>
        {description && <p className="mt-1 text-sm text-stone-500">{description}</p>}
      </div>
      <fieldset disabled={!canEdit} className="space-y-4">
        {children({ values, set, errors })}
      </fieldset>
      {result && <Notice kind={result.kind}>{result.text}</Notice>}
      {canEdit && (
        <button type="submit" disabled={saving || !dirty} className={primaryButtonClass}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      )}
    </form>
  )
}

const formatWhatsapp = (digits: string) => {
  const indian = /^91(\d{5})(\d{5})$/.exec(digits)
  return indian ? `+91 ${indian[1]} ${indian[2]}` : digits ? `+${digits}` : ''
}

export function ContactSocialPage() {
  const { user } = useAuth()
  const canEdit = user?.role === 'admin'
  const { data, error, reload } = useApi<SiteSettings>('/admin/settings')

  if (error) {
    return (
      <>
        <PageHeader title="Contact & social" />
        <ErrorNotice message={error} onRetry={reload} />
      </>
    )
  }
  if (!data) {
    return (
      <>
        <PageHeader title="Contact & social" />
        <LoadingBlock />
      </>
    )
  }

  const { brand, contact, social, footer } = data

  return (
    <>
      <PageHeader
        title="Contact & social"
        description="The details shown in the footer and menu, and used by every WhatsApp button on the website."
      />
      {!canEdit && <p className="mb-5 text-sm text-stone-500">Your account can view these details but not change them.</p>}

      <div className="grid gap-6 lg:grid-cols-2">
        <SettingsCard
          settingKey="contact"
          title="Contact details"
          initial={{ ...contact, addressLines: contact.addressLines.join('\n') }}
          toBody={(v) => ({
            ...v,
            addressLines: v.addressLines
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean),
          })}
          canEdit={canEdit}
        >
          {({ values, set, errors }) => (
            <>
              <TextInput
                id="contact-whatsapp"
                label="WhatsApp number"
                value={values.whatsappNumber}
                onChange={(v) => set('whatsappNumber')(v.replace(/\D/g, ''))}
                error={errors.whatsappNumber}
                hint={`Digits only, starting with the country code (91 for India). Shown as ${formatWhatsapp(values.whatsappNumber) || '…'}. Every “Enquire on WhatsApp” button uses this number.`}
                required
                type="tel"
              />
              <TextInput id="contact-phone" label="Phone (optional)" value={values.phone} onChange={set('phone')} error={errors.phone} type="tel" />
              <TextInput id="contact-email" label="Email (optional)" value={values.email} onChange={set('email')} error={errors.email} type="email" />
              <TextInput id="contact-address-name" label="Studio name" value={values.addressName} onChange={set('addressName')} error={errors.addressName} />
              <TextArea
                id="contact-address"
                label="Address"
                value={values.addressLines}
                onChange={set('addressLines')}
                error={errors.addressLines}
                rows={5}
                hint="One line of the address per line."
              />
            </>
          )}
        </SettingsCard>

        <div className="space-y-6">
          <SettingsCard
            settingKey="social"
            title="Social links"
            description="Leave a link empty to hide it from the website."
            initial={social}
            canEdit={canEdit}
          >
            {({ values, set, errors }) => (
              <>
                <TextInput id="social-instagram" label="Instagram" value={values.instagram} onChange={set('instagram')} error={errors.instagram} placeholder="https://www.instagram.com/…" />
                <TextInput id="social-youtube" label="YouTube" value={values.youtube} onChange={set('youtube')} error={errors.youtube} placeholder="https://youtube.com/@…" />
                <TextInput id="social-facebook" label="Facebook" value={values.facebook} onChange={set('facebook')} error={errors.facebook} placeholder="https://www.facebook.com/…" />
              </>
            )}
          </SettingsCard>

          <SettingsCard settingKey="brand" title="Brand" initial={brand} canEdit={canEdit}>
            {({ values, set, errors }) => (
              <>
                <TextInput id="brand-name" label="Brand name" value={values.name} onChange={set('name')} error={errors.name} required />
                <TextInput id="brand-tagline" label="Tagline" value={values.tagline} onChange={set('tagline')} error={errors.tagline} hint="Shown in the footer and the menu." />
              </>
            )}
          </SettingsCard>

          <SettingsCard settingKey="footer" title="Footer note" initial={footer} canEdit={canEdit}>
            {({ values, set, errors }) => (
              <TextInput id="footer-note" label="Short note (optional)" value={values.note} onChange={set('note')} error={errors.note} hint="Shown after the copyright line, e.g. “Made by hand in Nandurbar”." />
            )}
          </SettingsCard>
        </div>
      </div>
    </>
  )
}
