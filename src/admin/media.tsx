import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ApiError, uploadFile } from './api'
import { Dialog, EmptyState, ErrorNotice, LoadingBlock, Notice } from './components'
import { MEDIA_LIST_ID } from './forms'
import { useApi, useDebounced } from './hooks'
import { byFileName, shrinkImage } from './imageResize'
import { MAX_VIDEO_MB, VIDEO_TYPES, formatDuration, uploadVideo } from './videoUpload'
import type { MediaAsset, Paginated } from './types'
import { fieldClass, labelClass, secondaryButtonClass } from './ui'

/**
 * An image that tries again for a few seconds before giving up. On the live site a new
 * upload can take a moment to become readable everywhere, so a first miss is expected.
 * Only uploaded files (/api/media/…) are retried.
 */
export function MediaImage({
  src,
  className,
  alt = '',
  loading,
  onFailed,
}: {
  src: string
  className?: string
  alt?: string
  loading?: 'lazy' | 'eager'
  onFailed?: () => void
}) {
  const [attempt, setAttempt] = useState({ src, n: 0 })
  const n = attempt.src === src ? attempt.n : 0
  const retryable = src.startsWith('/api/media/')
  return (
    <img
      src={n ? `${src}?attempt=${n}` : src}
      alt={alt}
      loading={loading}
      className={className}
      onError={() => {
        if (retryable && n < 8) window.setTimeout(() => setAttempt({ src, n: n + 1 }), 1500)
        else onFailed?.()
      }}
    />
  )
}

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

const isVideoFile = (file: File) => file.type.startsWith('video/') || /\.(mp4|webm|mov)$/i.test(file.name)

interface UploadState {
  name: string
  progress: number
  /** What is happening before or after the bytes are sent. */
  note?: string
}

/** Which files an upload control takes. */
export type UploadAccept = 'image' | 'video' | 'any'

const acceptAttribute: Record<UploadAccept, string> = {
  image: ACCEPT_ATTRIBUTE,
  video: VIDEO_TYPES.join(','),
  any: [ACCEPT_ATTRIBUTE, ...VIDEO_TYPES].join(','),
}

/**
 * "Upload from PC": opens the computer's file browser, or takes files dragged onto it.
 * Shows progress, and the reason for any file that was refused. Calls `onUploaded` for
 * each file the server accepted; a video also brings the still picture made from it.
 */
export function UploadButton({
  onUploaded,
  multiple = false,
  accept = 'image',
  label = 'Upload from PC',
  className = secondaryButtonClass,
}: {
  onUploaded: (asset: MediaAsset, extra?: { poster: MediaAsset | null }) => void
  multiple?: boolean
  accept?: UploadAccept
  label?: string
  className?: string
}) {
  const input = useRef<HTMLInputElement>(null)
  const [current, setCurrent] = useState<UploadState | null>(null)
  const [problems, setProblems] = useState<string[]>([])
  const [dragging, setDragging] = useState(false)
  const busy = current !== null

  const upload = async (picked: File[]) => {
    const failed: string[] = []
    const files = multiple ? picked : picked.slice(0, 1)
    // In name order, so photos numbered 1, 1.1, 1.2 arrive in that order.
    for (const original of [...files].sort(byFileName)) {
      const video = isVideoFile(original)
      if ((video && accept === 'image') || (!video && accept === 'video')) {
        failed.push(`“${original.name}” is not ${accept === 'image' ? 'a JPEG, PNG or WebP image' : 'an MP4 or WebM video'}.`)
        continue
      }

      if (video) {
        setCurrent({ name: original.name, progress: 0, note: 'preparing…' })
        try {
          const { video: asset, poster } = await uploadVideo(original, ({ stage, fraction }) =>
            setCurrent({
              name: original.name,
              progress: fraction,
              note: stage === 'preparing' ? 'preparing…' : stage === 'still' ? 'saving its still picture…' : stage === 'finishing' ? 'finishing…' : undefined,
            }),
          )
          onUploaded(asset, { poster })
        } catch (err) {
          failed.push(err instanceof ApiError && err.message.startsWith('“') ? err.message : `“${original.name}”: ${err instanceof ApiError ? err.message : 'The upload failed.'}`)
        }
        continue
      }

      if (original.type && !ACCEPTED.includes(original.type)) {
        failed.push(`“${original.name}” is not a JPEG, PNG or WebP image.`)
        continue
      }
      setCurrent({ name: original.name, progress: 0, note: 'preparing…' })
      const file = await shrinkImage(original)
      const refused = precheck(file)
      if (refused) {
        failed.push(refused)
        continue
      }
      setCurrent({ name: file.name, progress: 0 })
      try {
        const asset = await uploadFile<MediaAsset>('/admin/media', file, (progress) => setCurrent({ name: file.name, progress }))
        onUploaded(asset)
      } catch (err) {
        failed.push(`“${file.name}”: ${err instanceof ApiError ? err.message : 'The upload failed.'}`)
      }
    }
    setCurrent(null)
    setProblems(failed)
  }

  const what = accept === 'video' ? 'videos' : accept === 'any' ? 'files' : 'pictures'

  return (
    <div
      className={`space-y-2 rounded-md transition-colors ${dragging ? 'bg-maroon/5 ring-2 ring-maroon/40 ring-offset-2' : ''}`}
      onDragOver={(e) => {
        if (busy || !e.dataTransfer.types.includes('Files')) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        setDragging(true)
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
      }}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        const files = Array.from(e.dataTransfer.files)
        if (files.length && !busy) void upload(files)
      }}
    >
      <input
        ref={input}
        type="file"
        accept={acceptAttribute[accept]}
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
      <button type="button" onClick={() => input.current?.click()} disabled={busy} className={className}>
        {busy ? 'Uploading…' : label}
      </button>
      {!busy && <p className="text-xs text-stone-500">or drag {multiple ? what : what.replace(/s$/, '')} here</p>}
      {current && (
        <div role="status" className="max-w-xs text-sm text-stone-600">
          <p className="truncate">
            {current.name} — {current.note ?? `${Math.round(current.progress * 100)}%`}
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

/**
 * A video preview that tries again for a few seconds: on the live site a new upload can
 * take a moment to become readable everywhere.
 */
export function MediaVideo({
  src,
  poster,
  className,
  controls = false,
  onFailed,
}: {
  src: string
  poster?: string | null
  className?: string
  controls?: boolean
  onFailed?: () => void
}) {
  const [attempt, setAttempt] = useState({ src, n: 0 })
  const n = attempt.src === src ? attempt.n : 0
  const retryable = src.startsWith('/api/media/')
  return (
    <video
      key={`${src}-${n}`}
      src={n ? `${src}?attempt=${n}` : src}
      poster={poster ?? undefined}
      className={className}
      controls={controls}
      muted
      playsInline
      preload="metadata"
      onError={() => {
        if (retryable && n < 6) window.setTimeout(() => setAttempt({ src, n: n + 1 }), 2000)
        else onFailed?.()
      }}
    />
  )
}

/** A grid of uploaded pictures or videos to pick one from, with search and upload. */
export function MediaLibraryDialog({
  open,
  onClose,
  onSelect,
  kind = 'image',
}: {
  open: boolean
  onClose: () => void
  onSelect: (asset: MediaAsset, extra?: { poster: MediaAsset | null }) => void
  kind?: 'image' | 'video'
}) {
  return (
    <Dialog open={open} onClose={onClose} title={kind === 'video' ? 'Choose a video' : 'Choose an image'} width="max-w-4xl">
      <LibraryBrowser onSelect={onSelect} kind={kind} />
    </Dialog>
  )
}

function LibraryBrowser({
  onSelect,
  kind,
}: {
  onSelect: (asset: MediaAsset, extra?: { poster: MediaAsset | null }) => void
  kind: 'image' | 'video'
}) {
  const [search, setSearch] = useState('')
  const query = useDebounced(search.trim())
  const { data, error, loading, reload } = useApi<Paginated<MediaAsset>>(
    `/admin/media?limit=60&kind=${kind}${query ? `&search=${encodeURIComponent(query)}` : ''}`,
    { raw: true },
  )
  const noun = kind === 'video' ? 'videos' : 'images'

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-56 flex-1">
          <label htmlFor="library-search" className={labelClass}>
            Search by file name or description
          </label>
          <input id="library-search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} className={fieldClass} />
        </div>
        <UploadButton onUploaded={onSelect} accept={kind} label={`Upload a new ${kind} from PC`} />
      </div>

      {error ? (
        <ErrorNotice message={error} onRetry={reload} />
      ) : !data ? (
        <LoadingBlock />
      ) : data.data.length === 0 ? (
        <EmptyState title={query ? `No ${noun} match` : `No uploaded ${noun} yet`}>
          {kind === 'video'
            ? `Upload an MP4 or WebM video of up to ${MAX_VIDEO_MB} MB.`
            : `Upload a JPEG, PNG or WebP image of up to ${MAX_UPLOAD_MB} MB.`}
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
                {asset.kind === 'video' ? (
                  <MediaVideo src={asset.url} className="pointer-events-none aspect-square w-full bg-stone-900 object-cover" />
                ) : (
                  <MediaImage src={asset.url} loading="lazy" className="aspect-square w-full bg-stone-100 object-cover" />
                )}
                <span className="block truncate px-2 pt-1.5 text-sm text-stone-800">{asset.filename}</span>
                <span className="block px-2 pb-1.5 text-xs text-stone-500">
                  {asset.width && asset.height ? `${asset.width} × ${asset.height} · ` : ''}
                  {asset.kind === 'video' && asset.durationSeconds != null ? `${formatDuration(asset.durationSeconds)} · ` : ''}
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
  disabled,
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
  /** View only: shows the picture and address without the buttons. */
  disabled?: boolean
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
            <MediaImage src={value} className="h-full w-full object-cover" onFailed={() => setBroken(value)} />
          )}
        </div>
        <div className="min-w-48 flex-1 space-y-2">
          <div className={disabled ? 'hidden' : 'flex flex-wrap gap-2'}>
            <UploadButton onUploaded={choose} label={value ? 'Upload a replacement from PC' : 'Upload from PC'} />
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
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-help`}
            placeholder="/media/… or https://…"
            className={`${fieldClass} mt-0 sm:text-sm`}
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

/**
 * Field for one video: shows it, and lets the administrator upload one from the computer,
 * choose one already uploaded, or type the address of a video on the website. A new upload
 * also brings a still picture made from its first frame (`onPosterSuggested`).
 */
export function VideoPicker({
  id,
  label,
  value,
  onChange,
  onPosterSuggested,
  poster,
  hint,
  error,
  required,
  disabled,
}: {
  id: string
  label: string
  value: string
  onChange: (url: string) => void
  /** Receives the address of the still picture saved from a newly uploaded video. */
  onPosterSuggested?: (url: string) => void
  /** Shown while the preview loads. */
  poster?: string | null
  hint?: ReactNode
  error?: string
  required?: boolean
  disabled?: boolean
}) {
  const [choosing, setChoosing] = useState(false)
  const [broken, setBroken] = useState<string | null>(null)

  const choose = (asset: MediaAsset, extra?: { poster: MediaAsset | null }) => {
    onChange(asset.url)
    if (extra?.poster) onPosterSuggested?.(extra.poster.url)
    setChoosing(false)
  }

  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className="mt-1.5 flex flex-wrap items-start gap-4">
        <div className="grid h-28 w-44 shrink-0 place-items-center overflow-hidden rounded-md border border-stone-200 bg-stone-900 text-center text-xs text-stone-300">
          {!value ? (
            'No video'
          ) : broken === value ? (
            <span className="px-2 text-red-300">No video was found at this address.</span>
          ) : (
            <MediaVideo src={value} poster={poster} controls className="h-full w-full object-contain" onFailed={() => setBroken(value)} />
          )}
        </div>
        <div className="min-w-48 flex-1 space-y-2">
          <div className={disabled ? 'hidden' : 'flex flex-wrap gap-2'}>
            <UploadButton onUploaded={choose} accept="video" label={value ? 'Upload a replacement from PC' : 'Upload from PC'} />
            <button type="button" onClick={() => setChoosing(true)} className={secondaryButtonClass}>
              Choose from library
            </button>
            {value && !required && (
              <button type="button" onClick={() => onChange('')} className={`${secondaryButtonClass} text-red-700`}>
                Remove
              </button>
            )}
          </div>
          <input
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            list={MEDIA_LIST_ID}
            required={required}
            disabled={disabled}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-help`}
            placeholder="/media/… or https://…"
            className={`${fieldClass} mt-0 sm:text-sm`}
          />
          <p id={`${id}-help`} className={`text-sm ${error ? 'text-red-700' : 'text-stone-500'}`}>
            {error ??
              hint ??
              `MP4 or WebM, up to ${MAX_VIDEO_MB} MB. Its first frame is saved as the still picture. For quick loading on phones, keep carousel videos short and under about 10 MB.`}
          </p>
        </div>
      </div>
      <MediaLibraryDialog open={choosing} onClose={() => setChoosing(false)} onSelect={choose} kind="video" />
    </div>
  )
}
