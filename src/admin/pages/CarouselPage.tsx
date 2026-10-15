import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, adminFetch } from '../api'
import { useAuth } from '../AuthContext'
import { ConfirmDialog, Dialog, EmptyState, ErrorNotice, LoadingBlock, Notice, PageHeader, Pill } from '../components'
import {
  Checkbox,
  MEDIA_LIST_ID,
  MediaLibraryList,
  MediaPreview,
  SelectInput,
  TextInput,
  mediaHint,
  useFormState,
} from '../forms'
import { useApi } from '../hooks'
import { statusOptions } from '../types'
import type { PublicationStatus, Slide } from '../types'
import { cardClass, primaryButtonClass, secondaryButtonClass } from '../ui'

interface SlideForm {
  mediaType: 'image' | 'video'
  mediaUrl: string
  posterUrl: string
  altText: string
  eyebrow: string
  heading: string
  description: string
  ctaLabel: string
  ctaUrl: string
  isActive: boolean
  status: PublicationStatus
}

const toForm = (slide?: Slide): SlideForm => ({
  mediaType: slide?.mediaType ?? 'image',
  mediaUrl: slide?.mediaUrl ?? '',
  posterUrl: slide?.posterUrl ?? '',
  altText: slide?.altText ?? '',
  eyebrow: slide?.eyebrow ?? '',
  heading: slide?.heading ?? '',
  description: slide?.description ?? '',
  ctaLabel: slide?.ctaLabel ?? '',
  ctaUrl: slide?.ctaUrl ?? '',
  isActive: slide?.isActive ?? true,
  status: slide?.status ?? 'published',
})

/** Is this slide visible to visitors right now? */
const isLive = (slide: Slide) => slide.status === 'published' && slide.isActive

function SlideEditor({
  slide,
  nextOrder,
  onClose,
  onSaved,
}: {
  slide: Slide | null
  nextOrder: number
  onClose: () => void
  onSaved: () => void
}) {
  const { values, set } = useFormState(toForm(slide ?? undefined))
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [failure, setFailure] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setErrors({})
    setFailure(null)
    const body = {
      ...values,
      posterUrl: values.mediaType === 'video' ? values.posterUrl : '',
      ...(slide ? {} : { displayOrder: nextOrder }),
    }
    try {
      await adminFetch(slide ? `/admin/slides/${slide.id}` : '/admin/slides', {
        method: slide ? 'PATCH' : 'POST',
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
    <Dialog open onClose={onClose} title={slide ? 'Edit slide' : 'Add a slide'} width="max-w-2xl">
      <form onSubmit={onSubmit} className="space-y-5">
        {failure && <Notice kind="error">{failure}</Notice>}

        <div className="grid gap-5 sm:grid-cols-2">
          <SelectInput
            id="slide-type"
            label="Picture or video"
            value={values.mediaType}
            onChange={(v) => set('mediaType')(v as 'image' | 'video')}
            options={[
              { value: 'image', label: 'Picture' },
              { value: 'video', label: 'Video' },
            ]}
          />
          <SelectInput
            id="slide-status"
            label="Status"
            value={values.status}
            onChange={(v) => set('status')(v as PublicationStatus)}
            options={statusOptions}
            error={errors.status}
          />
        </div>

        <TextInput
          id="slide-media"
          label={values.mediaType === 'video' ? 'Video file' : 'Picture'}
          value={values.mediaUrl}
          onChange={set('mediaUrl')}
          list={MEDIA_LIST_ID}
          hint={mediaHint}
          error={errors.mediaUrl}
          required
        />
        <MediaPreview url={values.mediaUrl} video={values.mediaType === 'video'} />

        {values.mediaType === 'video' && (
          <>
            <TextInput
              id="slide-poster"
              label="Still picture shown before the video plays"
              value={values.posterUrl}
              onChange={set('posterUrl')}
              list={MEDIA_LIST_ID}
              error={errors.posterUrl}
            />
            <MediaPreview url={values.posterUrl} />
          </>
        )}

        <TextInput
          id="slide-alt"
          label="Description of the picture (for people who cannot see it)"
          value={values.altText}
          onChange={set('altText')}
          error={errors.altText}
          hint="For example: A traditional floor loom strung with dark yarn."
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <TextInput
            id="slide-eyebrow"
            label="Small label above the heading (optional)"
            value={values.eyebrow}
            onChange={set('eyebrow')}
            error={errors.eyebrow}
          />
          <TextInput
            id="slide-heading"
            label="Heading"
            value={values.heading}
            onChange={set('heading')}
            error={errors.heading}
            required
          />
        </div>

        <TextInput
          id="slide-description"
          label="One-line description (optional)"
          value={values.description}
          onChange={set('description')}
          error={errors.description}
        />

        <div className="grid gap-5 sm:grid-cols-2">
          <TextInput
            id="slide-cta-label"
            label="Button text (optional)"
            value={values.ctaLabel}
            onChange={set('ctaLabel')}
            error={errors.ctaLabel}
            placeholder="Explore Collection"
          />
          <TextInput
            id="slide-cta-url"
            label="Button goes to"
            value={values.ctaUrl}
            onChange={set('ctaUrl')}
            error={errors.ctaUrl}
            placeholder="/collection"
            hint="A page such as /collection or /about, or a full https:// address."
          />
        </div>

        <Checkbox
          id="slide-active"
          label="Show this slide"
          hint="Untick to hide it without changing anything else."
          checked={values.isActive}
          onChange={set('isActive')}
        />

        <div className="flex flex-wrap justify-end gap-3 border-t border-stone-200 pt-5">
          <button type="button" onClick={onClose} className={secondaryButtonClass}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className={primaryButtonClass}>
            {saving ? 'Saving…' : slide ? 'Save changes' : 'Add slide'}
          </button>
        </div>
      </form>
    </Dialog>
  )
}

export function CarouselPage() {
  const { user } = useAuth()
  const canEdit = user?.role === 'admin'
  const { data, error, reload } = useApi<Slide[]>('/admin/slides')
  const [editing, setEditing] = useState<Slide | 'new' | null>(null)
  const [deleting, setDeleting] = useState<Slide | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const slides = data ?? []

  const run = async (action: () => Promise<unknown>, success: string) => {
    setBusy(true)
    setNotice(null)
    try {
      await action()
      setNotice({ kind: 'ok', text: success })
      reload()
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof ApiError ? err.message : 'Something went wrong.' })
    } finally {
      setBusy(false)
    }
  }

  /** Swaps a slide with its neighbour by exchanging their display order. */
  const move = (index: number, direction: -1 | 1) => {
    const a = slides[index]
    const b = slides[index + direction]
    if (!a || !b) return
    // Use positions, not the stored numbers, so slides with equal numbers still move.
    const orderA = index + 1
    const orderB = index + direction + 1
    void run(async () => {
      await adminFetch(`/admin/slides/${a.id}`, { method: 'PATCH', body: { displayOrder: orderB } })
      await adminFetch(`/admin/slides/${b.id}`, { method: 'PATCH', body: { displayOrder: orderA } })
      // Keep every other slide's number equal to its position.
      for (const [i, s] of slides.entries()) {
        if (s !== a && s !== b && s.displayOrder !== i + 1) {
          await adminFetch(`/admin/slides/${s.id}`, { method: 'PATCH', body: { displayOrder: i + 1 } })
        }
      }
    }, 'Order updated.')
  }

  const toggle = (slide: Slide) =>
    run(
      () => adminFetch(`/admin/slides/${slide.id}`, { method: 'PATCH', body: { isActive: !slide.isActive } }),
      slide.isActive ? 'Slide hidden.' : 'Slide shown.',
    )

  return (
    <>
      <MediaLibraryList />
      <PageHeader
        title="Homepage carousel"
        description="The large pictures and videos at the top of the homepage, in the order shown."
        action={
          canEdit && (
            <button type="button" onClick={() => setEditing('new')} className={primaryButtonClass}>
              Add slide
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
      ) : slides.length === 0 ? (
        <EmptyState title="No slides yet">
          Without slides, the homepage shows the brand tagline in place of the carousel.
        </EmptyState>
      ) : (
        <ol className="space-y-3" aria-busy={busy}>
          {slides.map((slide, i) => (
            <li key={slide.id} className={`${cardClass} flex flex-wrap items-center gap-4 p-4`}>
              <img
                src={slide.mediaType === 'video' ? (slide.posterUrl ?? '') : slide.mediaUrl}
                alt=""
                className="h-20 w-32 shrink-0 rounded-md bg-stone-100 object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-stone-500">
                  {i + 1}. {slide.mediaType === 'video' ? 'Video' : 'Picture'}
                  {slide.eyebrow && ` · ${slide.eyebrow}`}
                </p>
                <p className="truncate font-medium text-stone-900">{slide.heading}</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {isLive(slide) ? (
                    <Pill tone="ok">On the website</Pill>
                  ) : (
                    <Pill tone="warn">{slide.isActive ? `Hidden — ${slide.status}` : 'Hidden'}</Pill>
                  )}
                </div>
              </div>
              {canEdit && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={busy || i === 0}
                    aria-label={`Move "${slide.heading}" earlier`}
                    className={secondaryButtonClass}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={busy || i === slides.length - 1}
                    aria-label={`Move "${slide.heading}" later`}
                    className={secondaryButtonClass}
                  >
                    ↓
                  </button>
                  <button type="button" onClick={() => toggle(slide)} disabled={busy} className={secondaryButtonClass}>
                    {slide.isActive ? 'Hide' : 'Show'}
                  </button>
                  <button type="button" onClick={() => setEditing(slide)} className={secondaryButtonClass}>
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleting(slide)}
                    className={`${secondaryButtonClass} text-red-700`}
                  >
                    Delete
                  </button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {!canEdit && data && (
        <p className="mt-5 text-sm text-stone-500">Your account can view the carousel but not change it.</p>
      )}

      {editing && (
        <SlideEditor
          slide={editing === 'new' ? null : editing}
          nextOrder={slides.length + 1}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setNotice({ kind: 'ok', text: editing === 'new' ? 'Slide added.' : 'Slide saved.' })
            setEditing(null)
            reload()
          }}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this slide?"
        confirmLabel="Delete slide"
        busy={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={async () => {
          const slide = deleting
          if (!slide) return
          await run(() => adminFetch(`/admin/slides/${slide.id}`, { method: 'DELETE' }), 'Slide deleted.')
          setDeleting(null)
        }}
      >
        <p>
          “{deleting?.heading}” will be removed from the carousel. The picture file itself stays on the
          website. To hide a slide for now instead, use Hide.
        </p>
      </ConfirmDialog>
    </>
  )
}
