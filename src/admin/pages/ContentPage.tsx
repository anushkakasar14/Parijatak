import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, adminFetch } from '../api'
import { useAuth } from '../AuthContext'
import { ErrorNotice, LoadingBlock, Notice, PageHeader } from '../components'
import { MediaLibraryList, TextArea, TextInput, useFormState } from '../forms'
import { MediaPicker, VideoPicker } from '../media'
import { useApi } from '../hooks'
import type { PageSection, SiteSettings } from '../types'
import { cardClass, primaryButtonClass, secondaryButtonClass } from '../ui'

const pages = [
  { id: 'home', label: 'Homepage', path: '/' },
  { id: 'about', label: 'About', path: '/about' },
  { id: 'collection', label: 'Collection', path: '/collection' },
] as const

type PageId = (typeof pages)[number]['id']

/** One editable block of a page. Only the parts a block already uses are offered. */
function SectionEditor({ section, canEdit }: { section: PageSection; canEdit: boolean }) {
  const initial = {
    eyebrow: section.eyebrow ?? '',
    heading: section.heading,
    body: section.body,
    imageUrl: section.imageUrl ?? '',
    imageAlt: section.imageAlt ?? '',
    ctaLabel: section.ctaLabel ?? '',
    ctaUrl: section.ctaUrl ?? '',
  }
  const { values, set, dirty, markSaved, setValues } = useFormState(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [result, setResult] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const hasImage = section.imageUrl !== null
  // Buttons whose destination is fixed by the page (WhatsApp, Instagram) only offer their text.
  const hasLink = section.ctaUrl !== null
  const hasButton = section.ctaLabel !== null
  const id = (field: string) => `${section.id}-${field}`.replace(/\./g, '-')

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setErrors({})
    setResult(null)
    const body: Record<string, string> = { eyebrow: values.eyebrow, heading: values.heading, body: values.body }
    if (hasImage) Object.assign(body, { imageUrl: values.imageUrl, imageAlt: values.imageAlt })
    if (hasButton) body.ctaLabel = values.ctaLabel
    if (hasLink) body.ctaUrl = values.ctaUrl
    try {
      const saved = await adminFetch<PageSection>(`/admin/sections/${section.id}`, { method: 'PATCH', body })
      markSaved({
        eyebrow: saved.eyebrow ?? '',
        heading: saved.heading,
        body: saved.body,
        imageUrl: saved.imageUrl ?? '',
        imageAlt: saved.imageAlt ?? '',
        ctaLabel: saved.ctaLabel ?? '',
        ctaUrl: saved.ctaUrl ?? '',
      })
      setResult({ kind: 'ok', text: 'Saved. Visitors see the change the next time they open the page.' })
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors)
      setResult({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not save.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className={`${cardClass} space-y-4`} aria-labelledby={id('title')}>
      <h2 id={id('title')} className="font-sans text-lg font-medium text-stone-900">
        {section.label}
      </h2>

      <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
        <TextInput id={id('eyebrow')} label="Small label (optional)" value={values.eyebrow} onChange={set('eyebrow')} error={errors.eyebrow} disabled={!canEdit} />
        <TextInput id={id('heading')} label="Heading" value={values.heading} onChange={set('heading')} error={errors.heading} disabled={!canEdit} required />
      </div>

      <TextArea
        id={id('body')}
        label="Text"
        value={values.body}
        onChange={set('body')}
        error={errors.body}
        rows={Math.min(10, Math.max(3, values.body.split('\n').length + 2))}
        disabled={!canEdit}
        hint="Leave an empty line between paragraphs. Plain text only."
      />

      {hasImage && (
        <div className="space-y-4">
          <MediaPicker
            id={id('image')}
            label="Picture"
            value={values.imageUrl}
            onChange={set('imageUrl')}
            onAltSuggested={(alt) => !values.imageAlt && set('imageAlt')(alt)}
            error={errors.imageUrl}
            disabled={!canEdit}
          />
          <TextInput id={id('image-alt')} label="Description of the picture" value={values.imageAlt} onChange={set('imageAlt')} error={errors.imageAlt} disabled={!canEdit} />
        </div>
      )}

      {hasButton && (
        <div className="grid gap-4 sm:grid-cols-2">
          <TextInput id={id('cta-label')} label="Button text" value={values.ctaLabel} onChange={set('ctaLabel')} error={errors.ctaLabel} disabled={!canEdit} />
          {hasLink && (
            <TextInput id={id('cta-url')} label="Button goes to" value={values.ctaUrl} onChange={set('ctaUrl')} error={errors.ctaUrl} disabled={!canEdit} hint="A page such as /about, or a full https:// address." />
          )}
        </div>
      )}

      {result && <Notice kind={result.kind}>{result.text}</Notice>}

      {canEdit && (
        <div className="flex flex-wrap gap-3">
          <button type="submit" disabled={saving || !dirty} className={primaryButtonClass}>
            {saving ? 'Saving…' : 'Save'}
          </button>
          {dirty && (
            <button type="button" onClick={() => setValues(initial)} className={secondaryButtonClass}>
              Undo changes
            </button>
          )}
        </div>
      )}
    </form>
  )
}

/** The "From the studio" pictures and videos on the homepage. */
function GalleryEditor({ canEdit }: { canEdit: boolean }) {
  const { data, error, reload } = useApi<SiteSettings>('/admin/settings')
  if (error) return <ErrorNotice message={error} onRetry={reload} />
  if (!data) return <LoadingBlock />
  return <GalleryForm key={JSON.stringify(data.gallery)} initial={data.gallery.items} canEdit={canEdit} />
}

function GalleryForm({ initial, canEdit }: { initial: SiteSettings['gallery']['items']; canEdit: boolean }) {
  const { values: items, setValues: setItems, dirty, markSaved } = useFormState(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [result, setResult] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const update = (index: number, field: 'imageUrl' | 'videoUrl' | 'alt', value: string) =>
    setItems((current) => current.map((item, i) => (i === index ? { ...item, [field]: value } : item)))

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setErrors({})
    setResult(null)
    try {
      await adminFetch('/admin/settings/gallery', { method: 'PUT', body: { items } })
      markSaved()
      setResult({ kind: 'ok', text: 'Saved.' })
    } catch (err) {
      if (err instanceof ApiError && err.errors) setErrors(err.errors)
      setResult({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not save.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className={`${cardClass} space-y-4`}>
      <h2 className="font-sans text-lg font-medium text-stone-900">Homepage — “From the studio” pictures</h2>
      <p className="text-sm text-stone-500">Up to 12. Three look best. A video plays silently on a loop; its picture is shown while it loads.</p>

      <ol className="space-y-4">
        {items.map((item, i) => (
          <li key={i} className="rounded-md border border-stone-200 p-4">
            <div className="space-y-3">
              <MediaPicker
                id={`gallery-${i}-image`}
                label={`Picture ${i + 1}`}
                value={item.imageUrl}
                onChange={(v) => update(i, 'imageUrl', v)}
                onAltSuggested={(alt) => !item.alt && update(i, 'alt', alt)}
                error={errors[`items.${i}.imageUrl`]}
                required
                disabled={!canEdit}
              />
              <VideoPicker
                id={`gallery-${i}-video`}
                label="Video (optional)"
                value={item.videoUrl}
                onChange={(v) => update(i, 'videoUrl', v)}
                // With no picture yet, the video's first frame becomes it.
                onPosterSuggested={(url) => !item.imageUrl && update(i, 'imageUrl', url)}
                poster={item.imageUrl}
                hint="Plays silently on a loop; the picture above is shown while it loads. MP4 or WebM, up to 100 MB — short clips under about 10 MB load best."
                error={errors[`items.${i}.videoUrl`]}
                disabled={!canEdit}
              />
              <TextInput id={`gallery-${i}-alt`} label="Description" value={item.alt} onChange={(v) => update(i, 'alt', v)} error={errors[`items.${i}.alt`]} disabled={!canEdit} />
              {canEdit && (
                <button type="button" onClick={() => setItems(items.filter((_, j) => j !== i))} className={`${secondaryButtonClass} text-red-700`}>
                  Remove
                </button>
              )}
            </div>
          </li>
        ))}
      </ol>

      {result && <Notice kind={result.kind}>{result.text}</Notice>}

      {canEdit && (
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={() => setItems([...items, { imageUrl: '', videoUrl: '', alt: '' }])} disabled={items.length >= 12} className={secondaryButtonClass}>
            Add a picture
          </button>
          <button type="submit" disabled={saving || !dirty} className={primaryButtonClass}>
            {saving ? 'Saving…' : 'Save pictures'}
          </button>
        </div>
      )}
    </form>
  )
}

export function ContentPage() {
  const { user } = useAuth()
  const canEdit = user?.role === 'admin'
  const [page, setPage] = useState<PageId>('home')
  const { data, error, reload } = useApi<PageSection[]>('/admin/sections')
  const current = pages.find((p) => p.id === page) ?? pages[0]
  const sections = (data ?? []).filter((s) => s.page === page)

  return (
    <>
      <MediaLibraryList />
      <PageHeader
        title="Homepage & About"
        description="The headings, text, pictures and buttons on the website's pages."
        action={
          <a href={current.path} target="_blank" rel="noopener noreferrer" className={secondaryButtonClass}>
            View on website ↗
          </a>
        }
      />

      <div role="tablist" aria-label="Page" className="mb-6 flex flex-wrap gap-2">
        {pages.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={page === p.id}
            onClick={() => setPage(p.id)}
            className={`min-h-11 rounded-full px-4 py-2 text-sm font-medium transition-colors ${
              page === p.id ? 'bg-maroon text-white' : 'border border-stone-300 bg-white text-stone-700 hover:bg-stone-50'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {!canEdit && <p className="mb-5 text-sm text-stone-500">Your account can view this content but not change it.</p>}

      {error ? (
        <ErrorNotice message={error} onRetry={reload} />
      ) : !data ? (
        <LoadingBlock />
      ) : (
        <div className="space-y-6" role="tabpanel">
          {sections.map((section) => (
            <SectionEditor key={`${section.id}-${section.heading}`} section={section} canEdit={canEdit} />
          ))}
          {page === 'home' && <GalleryEditor canEdit={canEdit} />}
        </div>
      )}
    </>
  )
}
