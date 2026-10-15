import { useState } from 'react'
import type { FormEvent } from 'react'
import { ApiError, adminFetch } from '../api'
import { useAuth } from '../AuthContext'
import { ConfirmDialog, Dialog, EmptyState, ErrorNotice, LoadingBlock, Notice, PageHeader, formatDate } from '../components'
import { TextInput } from '../forms'
import { useApi, useDebounced } from '../hooks'
import { MAX_UPLOAD_MB, UploadButton, formatBytes } from '../media'
import type { MediaAsset, Paginated } from '../types'
import { fieldClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../ui'

const PAGE_SIZE = 48

function AssetDetails({
  asset,
  canEdit,
  onClose,
  onSaved,
  onDelete,
}: {
  asset: MediaAsset
  canEdit: boolean
  onClose: () => void
  onSaved: (asset: MediaAsset) => void
  onDelete: () => void
}) {
  const [altText, setAltText] = useState(asset.altText)
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const [copied, setCopied] = useState(false)

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setResult(null)
    try {
      const saved = await adminFetch<MediaAsset>(`/admin/media/${asset.id}`, { method: 'PATCH', body: { altText } })
      setResult({ kind: 'ok', text: 'Description saved.' })
      onSaved(saved)
    } catch (err) {
      setResult({ kind: 'error', text: err instanceof ApiError ? err.message : 'Could not save.' })
    } finally {
      setSaving(false)
    }
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(asset.url)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <Dialog open onClose={onClose} title={asset.filename} width="max-w-2xl">
      <img src={asset.url} alt={asset.altText} className="max-h-[50svh] w-full rounded-md bg-stone-100 object-contain" />
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-stone-500">Size</dt>
          <dd className="text-stone-900">{asset.width && asset.height ? `${asset.width} × ${asset.height} px` : '—'}</dd>
        </div>
        <div>
          <dt className="text-stone-500">File</dt>
          <dd className="text-stone-900">{formatBytes(asset.byteSize)}</dd>
        </div>
        <div>
          <dt className="text-stone-500">Type</dt>
          <dd className="text-stone-900">{asset.contentType.replace('image/', '').toUpperCase()}</dd>
        </div>
        <div>
          <dt className="text-stone-500">Uploaded</dt>
          <dd className="text-stone-900">{formatDate(asset.createdAt)}</dd>
        </div>
      </dl>

      <div className="mt-4">
        <label htmlFor="asset-url" className={labelClass}>
          Address
        </label>
        <div className="mt-1.5 flex gap-2">
          <input id="asset-url" readOnly value={asset.url} className={`${fieldClass} mt-0 text-sm`} onFocus={(e) => e.target.select()} />
          <button type="button" onClick={copy} className={secondaryButtonClass}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>

      <form onSubmit={save} className="mt-4 space-y-3">
        <TextInput
          id="asset-alt"
          label="Description (for people who cannot see the image)"
          value={altText}
          onChange={setAltText}
          disabled={!canEdit}
          maxLength={200}
          hint="Suggested automatically when this image is chosen for a product."
        />
        {result && <Notice kind={result.kind}>{result.text}</Notice>}
        {canEdit && (
          <div className="flex flex-wrap justify-between gap-3 border-t border-stone-200 pt-4">
            <button type="button" onClick={onDelete} className={`${secondaryButtonClass} text-red-700`}>
              Delete image
            </button>
            <button type="submit" disabled={saving || altText === asset.altText} className={primaryButtonClass}>
              {saving ? 'Saving…' : 'Save description'}
            </button>
          </div>
        )}
      </form>
    </Dialog>
  )
}

export function MediaPage() {
  const { user } = useAuth()
  const canEdit = user?.role === 'admin'
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const query = useDebounced(search.trim())
  const { data, error, loading, reload } = useApi<Paginated<MediaAsset>>(
    `/admin/media?limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}${query ? `&search=${encodeURIComponent(query)}` : ''}`,
    { raw: true },
  )
  const [open, setOpen] = useState<MediaAsset | null>(null)
  const [deleting, setDeleting] = useState<MediaAsset | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const total = data?.pagination.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const remove = async (asset: MediaAsset) => {
    setBusy(true)
    setNotice(null)
    try {
      await adminFetch(`/admin/media/${asset.id}`, { method: 'DELETE' })
      setNotice({ kind: 'ok', text: `“${asset.filename}” was deleted.` })
      setOpen(null)
      reload()
    } catch (err) {
      setNotice({ kind: 'error', text: err instanceof ApiError ? err.message : 'Something went wrong.' })
      setOpen(null)
    } finally {
      setBusy(false)
      setDeleting(null)
    }
  }

  return (
    <>
      <PageHeader
        title="Media library"
        description={`Images uploaded for products and pages. JPEG, PNG or WebP, up to ${MAX_UPLOAD_MB} MB each.`}
        action={
          canEdit && (
            <UploadButton
              multiple
              label="Upload images"
              className={primaryButtonClass}
              onUploaded={(asset) => {
                setNotice({ kind: 'ok', text: `“${asset.filename}” was uploaded.` })
                setPage(1)
                reload()
              }}
            />
          )
        }
      />

      <div className="mb-5 max-w-md">
        <label htmlFor="media-search" className={labelClass}>
          Search by file name or description
        </label>
        <input
          id="media-search"
          type="search"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value)
            setPage(1)
          }}
          className={fieldClass}
        />
      </div>

      {notice && (
        <div className="mb-5">
          <Notice kind={notice.kind}>{notice.text}</Notice>
        </div>
      )}

      {error ? (
        <ErrorNotice message={error} onRetry={reload} />
      ) : !data ? (
        <LoadingBlock />
      ) : data.data.length === 0 ? (
        <EmptyState title={query ? 'No images match' : 'No uploaded images yet'}>
          {query ? 'Try another word.' : 'Images you upload here, or from a product, appear in this library.'}
        </EmptyState>
      ) : (
        <>
          <p className="mb-3 text-sm text-stone-500">
            {total} {total === 1 ? 'image' : 'images'}
          </p>
          <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6" aria-busy={loading}>
            {data.data.map((asset) => (
              <li key={asset.id}>
                <button
                  type="button"
                  onClick={() => setOpen(asset)}
                  className="block w-full overflow-hidden rounded-lg border border-stone-200 bg-white text-left hover:border-maroon"
                >
                  <img src={asset.url} alt="" loading="lazy" className="aspect-square w-full bg-stone-100 object-cover" />
                  <span className="block truncate px-2.5 pt-2 text-sm text-stone-800">{asset.filename}</span>
                  <span className="block px-2.5 pb-2 text-xs text-stone-500">
                    {asset.width && asset.height ? `${asset.width} × ${asset.height} · ` : ''}
                    {formatBytes(asset.byteSize)}
                    {!asset.altText && ' · no description'}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {pages > 1 && (
            <nav aria-label="Pages" className="mt-5 flex items-center justify-center gap-3">
              <button type="button" onClick={() => setPage(page - 1)} disabled={page <= 1} className={secondaryButtonClass}>
                Previous
              </button>
              <span className="text-sm text-stone-600">
                Page {page} of {pages}
              </span>
              <button type="button" onClick={() => setPage(page + 1)} disabled={page >= pages} className={secondaryButtonClass}>
                Next
              </button>
            </nav>
          )}
        </>
      )}

      {open && (
        <AssetDetails
          asset={open}
          canEdit={canEdit}
          onClose={() => setOpen(null)}
          onSaved={(saved) => {
            setOpen(saved)
            reload()
          }}
          onDelete={() => setDeleting(open)}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this image?"
        confirmLabel="Delete image"
        busy={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && void remove(deleting)}
      >
        <p>
          “{deleting?.filename}” will be removed permanently. If a product or page still uses it, it will not be
          deleted and you will be told where it is used.
        </p>
      </ConfirmDialog>
    </>
  )
}
