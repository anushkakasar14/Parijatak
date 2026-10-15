import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, adminFetch } from '../api'
import { useAuth } from '../AuthContext'
import { ConfirmDialog, Dialog, EmptyState, ErrorNotice, LoadingBlock, Notice, PageHeader, Pill } from '../components'
import {
  MEDIA_LIST_ID,
  MediaLibraryList,
  MediaPreview,
  SelectInput,
  TextArea,
  TextInput,
  mediaHint,
  useFormState,
} from '../forms'
import { useApi } from '../hooks'
import { statusOptions } from '../types'
import type { Offer, PublicationStatus } from '../types'
import { cardClass, primaryButtonClass, secondaryButtonClass } from '../ui'

// Dates are entered and shown in India Standard Time.
const IST = '+05:30'
const toDateInput = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Asia/Kolkata' }) : ''
const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium' })

type Timing = 'running' | 'scheduled' | 'ended' | 'hidden'

function timingOf(offer: Offer, now = Date.now()): Timing {
  if (offer.status !== 'published') return 'hidden'
  if (offer.startsAt && new Date(offer.startsAt).getTime() > now) return 'scheduled'
  if (offer.endsAt && new Date(offer.endsAt).getTime() <= now) return 'ended'
  return 'running'
}

const timingPill: Record<Timing, { tone: 'ok' | 'warn' | 'neutral'; text: string }> = {
  running: { tone: 'ok', text: 'Showing on the website' },
  scheduled: { tone: 'warn', text: 'Scheduled' },
  ended: { tone: 'neutral', text: 'Ended' },
  hidden: { tone: 'neutral', text: 'Hidden' },
}

interface OfferForm {
  title: string
  description: string
  discountText: string
  bannerImageUrl: string
  bannerImageAlt: string
  ctaLabel: string
  ctaUrl: string
  startsOn: string
  endsOn: string
  status: PublicationStatus
}

const toForm = (offer?: Offer): OfferForm => ({
  title: offer?.title ?? '',
  description: offer?.description ?? '',
  discountText: offer?.discountText ?? '',
  bannerImageUrl: offer?.bannerImageUrl ?? '',
  bannerImageAlt: offer?.bannerImageAlt ?? '',
  ctaLabel: offer?.ctaLabel ?? '',
  ctaUrl: offer?.ctaUrl ?? '',
  startsOn: toDateInput(offer?.startsAt ?? null),
  endsOn: toDateInput(offer?.endsAt ?? null),
  status: offer?.status ?? 'draft',
})

function OfferEditor({ offer, onClose, onSaved }: { offer: Offer | null; onClose: () => void; onSaved: () => void }) {
  const { values, set } = useFormState(toForm(offer ?? undefined))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setErrors({})
    setFailure(null)
    const { startsOn, endsOn, ...rest } = values
    const body = {
      ...rest,
      // A start date begins at midnight; an end date lasts until the end of that day.
      startsAt: startsOn ? `${startsOn}T00:00:00${IST}` : null,
      endsAt: endsOn ? `${endsOn}T23:59:59${IST}` : null,
    }
    try {
      await adminFetch(offer ? `/admin/offers/${offer.id}` : '/admin/offers', {
        method: offer ? 'PATCH' : 'POST',
        body,
      })
      onSaved()
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors)
      setFailure(err instanceof ApiError ? err.message : 'Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onClose={onClose} title={offer ? 'Edit offer' : 'New offer'} width="max-w-2xl">
      <form onSubmit={onSubmit} className="space-y-5">
        {failure && <Notice kind="error">{failure}</Notice>}

        <TextInput id="offer-title" label="Title" value={values.title} onChange={set('title')} error={errors.title} required placeholder="Festive Collection" />
        <div className="grid gap-5 sm:grid-cols-2">
          <TextInput id="offer-discount" label="Offer in a few words (optional)" value={values.discountText} onChange={set('discountText')} error={errors.discountText} placeholder="15% off all throws" />
          <SelectInput id="offer-status" label="Status" value={values.status} onChange={(v) => set('status')(v as PublicationStatus)} options={statusOptions} error={errors.status} />
        </div>
        <TextArea id="offer-description" label="Short description (optional)" value={values.description} onChange={set('description')} error={errors.description} rows={2} />

        <div className="grid gap-5 sm:grid-cols-2">
          <TextInput id="offer-start" type="date" label="Starts on (optional)" value={values.startsOn} onChange={set('startsOn')} error={errors.startsAt} hint="Leave empty to start straight away." />
          <TextInput id="offer-end" type="date" label="Ends after (optional)" value={values.endsOn} onChange={set('endsOn')} error={errors.endsAt} hint="Shown until the end of this day. Leave empty to keep it running." />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <TextInput id="offer-cta-label" label="Link text (optional)" value={values.ctaLabel} onChange={set('ctaLabel')} error={errors.ctaLabel} placeholder="Shop the offer" />
          <TextInput id="offer-cta-url" label="Link goes to" value={values.ctaUrl} onChange={set('ctaUrl')} error={errors.ctaUrl} placeholder="/collection" />
        </div>

        <details className="rounded-md border border-stone-200 p-4">
          <summary className="cursor-pointer text-sm font-medium text-stone-700">Banner picture (optional)</summary>
          <div className="mt-4 space-y-4">
            <TextInput id="offer-image" label="Picture" value={values.bannerImageUrl} onChange={set('bannerImageUrl')} list={MEDIA_LIST_ID} hint={mediaHint} error={errors.bannerImageUrl} />
            <MediaPreview url={values.bannerImageUrl} />
            <TextInput id="offer-image-alt" label="Description of the picture" value={values.bannerImageAlt} onChange={set('bannerImageAlt')} error={errors.bannerImageAlt} />
          </div>
        </details>

        <p className="text-sm text-stone-500">
          A published offer appears as a slim band just below the homepage carousel while it is in date.
        </p>

        <div className="flex flex-wrap justify-end gap-3 border-t border-stone-200 pt-5">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className={primaryButtonClass}>
            {saving ? 'Saving…' : offer ? 'Save changes' : 'Create offer'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

export function OffersPage() {
  const { user } = useAuth()
  const canEdit = user?.role === 'admin'
  const { data, error, reload } = useApi<Offer[]>('/admin/offers')
  const [editing, setEditing] = useState<Offer | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Offer | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const remove = async () => {
    if (!deleting) return
    setBusy(true)
    try {
      await adminFetch(`/admin/offers/${deleting.id}`, { method: 'DELETE' })
      setNotice({ kind: 'ok', text: 'Offer deleted.' })
      reload()
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not delete.' })
    } finally {
      setBusy(false)
      setDeleting(null)
    }
  }

  return (
    <>
      <MediaLibraryList />
      <PageHeader
        title="Offers & banners"
        description="Announcements shown in a band below the homepage carousel, for as long as you choose."
        action={
          canEdit && (
            <button type="button" onClick={() => setEditing('new')} className={primaryButtonClass}>
              New offer
            </button>
          )
        }
      />

      {notice && (
        <div className="mb-5">
          <Notice kind={notice.kind}>{notice.text}</Notice>
        </div>
      )}

      {error ? (
        <ErrorNotice message={error} onRetry={reload} />
      ) : !data ? (
        <LoadingBlock />
      ) : data.length === 0 ? (
        <EmptyState title="No offers yet">
          Create one to announce a sale, a new collection or a festival greeting.
        </EmptyState>
      ) : (
        <ul className="space-y-3">
          {data.map((offer) => {
            const pill = timingPill[timingOf(offer)]
            return (
              <li key={offer.id} className={`${cardClass} flex flex-wrap items-center justify-between gap-4 p-4`}>
                <div className="min-w-0">
                  <p className="font-medium text-stone-900">
                    {offer.title}
                    {offer.discountText && <span className="text-stone-500"> — {offer.discountText}</span>}
                  </p>
                  <p className="mt-0.5 text-sm text-stone-500">
                    {offer.startsAt ? `From ${formatDay(offer.startsAt)}` : 'From now'}
                    {offer.endsAt ? ` until ${formatDay(offer.endsAt)}` : ', no end date'}
                  </p>
                  <div className="mt-1.5">
                    <Pill tone={pill.tone}>{pill.text}</Pill>
                  </div>
                </div>
                {canEdit && (
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setEditing(offer)} className={secondaryButtonClass}>
                      Edit
                    </button>
                    <button type="button" onClick={() => setDeleting(offer)} className={`${secondaryButtonClass} text-red-700`}>
                      Delete
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {!canEdit && data && (
        <p className="mt-5 text-sm text-stone-500">Your account can view offers but not change them.</p>
      )}

      {editing && (
        <OfferEditor
          offer={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setNotice({ kind: 'ok', text: editing === 'new' ? 'Offer created.' : 'Offer saved.' })
            setEditing(null)
            reload()
          }}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this offer?"
        confirmLabel="Delete offer"
        busy={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={remove}
      >
        <p>“{deleting?.title}” will be removed permanently. To take it off the website for now, set its status to Draft instead.</p>
      </ConfirmDialog>
    </>
  )
}
