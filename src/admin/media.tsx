import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ApiError, uploadFile } from './api'
import { Dialog, EmptyState, ErrorNotice, LoadingBlock, Notice } from './components'
import { MEDIA_LIST_ID } from './forms'
import { useApi, useDebounced } from './hooks'
import type { MediaAsset, Paginated } from './types'
import { fieldClass, labelClass, secondaryButtonClass } from './ui'

/** Uploading: the limits the server enforces, repeated here only to fail fast with a clear message. */
export const MAX_UPLOAD_MB = 4
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp']
export const ACCEPT_ATTRIBUTE = ACCEPTED.join(',')

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** A message for a file that will certainly be refused, or null to send it. */
function precheck(file: File): string | null {
  if (file.type && !ACCEPTED.includes(file.type)) return `“${file.name}” is not a JPEG, PNG or WebP image.`
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) {
    return `“${file.name}” is ${formatBytes(file.size)}. Images can be up to ${MAX_UPLOAD_MB} MB.`
  }
  if (file.size === 0) return `“${file.name}” is empty.`
  return null
}

interface UploadState {
  name: string
  progress: number
}

/**
 * Upload button with a progress bar. Calls `onUploaded` for each image the server
 * accepted, and shows the server's reason for any it refused.
 */
export function UploadButton({
  onUploaded,
  multiple = false,
  label = 'Upload image',
  className = secondaryButtonClass,
}: {
  onUploaded: (asset: MediaAsset) => void
  multiple?: boolean
  label?: string
  className?: string
}) {
  const input = useRef<HTMLInputElement>(null)
  const [current, setCurrent] = useState<UploadState | null>(null)
  const [problems, setProblems] = useState<string[]>([])

  const upload = async (files: File[]) => {
    const failed: string[] = []
    for (const file of files) {
      const refused = precheck(file)
      if (refused) {
        failed.push(refused)
        continue
      }
      setCurrent({ name: file.name, progress: 0 })
      try {
        const asset = await uploadFile<MediaAsset>('/admin/media', file, (progress) =>
          setCurrent({ name: file.name, progress }),
        )
        onUploaded(asset)
      } catch (err) {
        failed.push(`“${file.name}”: ${err instanceof ApiError ? err.message : 'The upload failed.'}`)
      }
    }
    setCurrent(null)
    setProblems(failed)
  }

  return (
    <div className="space-y-2">
      <input
        ref={input}
        type="file"
        accept={ACCEPT_ATTRIBUTE}
        multiple={multiple}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? [])
          e.target.value = '' // allow choosing the same file again
          if (files.length) void upload(files)
        }}
      />
      <button type="button" onClick={() => input.current?.click()} disabled={current !== null} className={className}>
        {current ? 'Uploading…' : label}
      </button>
      {current && (
        <div role="status" className="max-w-xs text-sm text-stone-600">
          <p className="truncate">
            {current.name} — {Math.round(current.progress * 100)}%
          </p>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-200">
            <div className="h-full bg-maroon transition-[width]" style={{ width: `${current.progress * 100}%` }} />
          </div>
        </div>
      )}
      {problems.map((problem) => (
        <Notice key={problem} kind="error">
          {problem}
        </Notice>
      ))}
    </div>
  )
}

/** A grid of uploaded images to pick one from, with search and upload. */
export function MediaLibraryDialog({
  open,
  onClose,
  onSelect,
}: {
  open: boolean
  onClose: () => void
  onSelect: (asset: MediaAsset) => void
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Choose an image" width="max-w-4xl">
      <LibraryBrowser onSelect={onSelect} />
    </Dialog>
  )
}

function LibraryBrowser({ onSelect }: { onSelect: (asset: MediaAsset) => void }) {
  const [search, setSearch] = useState('')
  const query = useDebounced(search.trim())
  const { data, error, loading, reload } = useApi<Paginated<MediaAsset>>(
    `/admin/media?limit=60${query ? `&search=${encodeURIComponent(query)}` : ''}`,
    { raw: true },
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-56 flex-1">
          <label htmlFor="library-search" className={labelClass}>
            Search by file name or description
          </label>
          <input
            id="library-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={fieldClass}
          />
        </div>
        <UploadButton onUploaded={onSelect} label="Upload a new image" />
      </div>

      {error ? (
        <ErrorNotice message={error} onRetry={reload} />
      ) : !data ? (
        <LoadingBlock />
      ) : data.data.length === 0 ? (
        <EmptyState title={query ? 'No images match' : 'No uploaded images yet'}>
          Upload a JPEG, PNG or WebP image of up to {MAX_UPLOAD_MB} MB.
        </EmptyState>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4" aria-busy={loading}>
          {data.data.map((asset) => (
            <li key={asset.id}>
              <button
                type="button"
                onClick={() => onSelect(asset)}
                className="group block w-full overflow-hidden rounded-md border border-stone-200 bg-white text-left hover:border-maroon focus-visible:border-maroon"
              >
                <img src={asset.url} alt="" loading="lazy" className="aspect-square w-full bg-stone-100 object-cover" />
                <span className="block truncate px-2 pt-1.5 text-sm text-stone-800">{asset.filename}</span>
                <span className="block px-2 pb-1.5 text-xs text-stone-500">
                  {asset.width && asset.height ? `${asset.width} × ${asset.height} · ` : ''}
                  {formatBytes(asset.byteSize)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/**
 * Field for one image: shows a preview, and lets the administrator upload a new
 * image, choose one already uploaded, or type the address of a file on the website.
 * Render <MediaLibraryList /> once on the page for the address suggestions.
 */
export function MediaPicker({
  id,
  label,
  value,
  onChange,
  onAltSuggested,
  hint,
  error,
  required,
  extraActions,
}: {
  id: string
  label: string
  value: string
  onChange: (url: string) => void
  /** Receives the image's saved description when one is chosen from the library. */
  onAltSuggested?: (alt: string) => void
  hint?: ReactNode
  error?: string
  required?: boolean
  extraActions?: ReactNode
}) {
  const [choosing, setChoosing] = useState(false)
  const [broken, setBroken] = useState<string | null>(null)

  const choose = (asset: MediaAsset) => {
    onChange(asset.url)
    if (asset.altText) onAltSuggested?.(asset.altText)
    setChoosing(false)
  }

  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className="mt-1.5 flex flex-wrap items-start gap-4">
        <div className="grid h-28 w-36 shrink-0 place-items-center overflow-hidden rounded-md border border-stone-200 bg-stone-100 text-center text-xs text-stone-500">
          {!value ? (
            'No image'
          ) : broken === value ? (
            <span className="px-2 text-red-700">No file was found at this address.</span>
          ) : (
            <img src={value} alt="" className="h-full w-full object-cover" onError={() => setBroken(value)} />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap gap-2">
            <UploadButton onUploaded={choose} label={value ? 'Upload a replacement' : 'Upload image'} />
            <button type="button" onClick={() => setChoosing(true)} className={secondaryButtonClass}>
              Choose from library
            </button>
            {value && !required && (
              <button type="button" onClick={() => onChange('')} className={`${secondaryButtonClass} text-red-700`}>
                Remove
              </button>
            )}
            {extraActions}
          </div>
          <input
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            list={MEDIA_LIST_ID}
            required={required}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-help`}
            placeholder="/media/… or https://…"
            className={`${fieldClass} mt-0 text-sm`}
          />
          <p id={`${id}-help`} className={`text-sm ${error ? 'text-red-700' : 'text-stone-500'}`}>
            {error ??
              hint ??
              `JPEG, PNG or WebP, up to ${MAX_UPLOAD_MB} MB. You can also type the address of a file already on the website.`}
          </p>
        </div>
      </div>
      <MediaLibraryDialog open={choosing} onClose={() => setChoosing(false)} onSelect={choose} />
    </div>
  )
}
