import { useState } from 'react'
import type { DragEvent } from 'react'
import { MediaImage, MediaLibraryDialog, UploadButton } from './media'
import type { MediaAsset } from './types'
import { fieldClass, labelClass, secondaryButtonClass } from './ui'

/** Most pictures a product can have (the server enforces the same limit). */
export const MAX_PRODUCT_IMAGES = 13

/** A picture in the form, before saving. The first one is the main picture. */
export interface DraftImage {
  /** Stable key for React and drag-and-drop; not stored. */
  key: string
  url: string
  alt: string
}

let counter = 0
export const draftImage = (url: string, alt = ''): DraftImage => ({ key: `new-${++counter}`, url, alt })

const smallButton =
  'inline-flex min-h-9 items-center justify-center rounded-md border border-stone-300 bg-white px-2.5 text-sm text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-50'

/**
 * Edits a product's pictures in the form: add (upload or library), replace, remove,
 * reorder (drag-and-drop or arrow buttons), choose the main picture, and describe each.
 * Nothing changes on the website until the product is saved.
 */
export function ProductGallery({
  images,
  onChange,
  errors,
}: {
  images: DraftImage[]
  onChange: (update: (current: DraftImage[]) => DraftImage[]) => void
  errors: Record<string, string>
}) {
  const [library, setLibrary] = useState<{ mode: 'add' } | { mode: 'replace'; key: string } | null>(null)
  const [confirmingRemove, setConfirmingRemove] = useState<string | null>(null)
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [dropKey, setDropKey] = useState<string | null>(null)
  const full = images.length >= MAX_PRODUCT_IMAGES

  const add = (asset: MediaAsset) =>
    onChange((current) =>
      current.length >= MAX_PRODUCT_IMAGES ? current : [...current, draftImage(asset.url, asset.altText)],
    )

  const replace = (key: string, asset: MediaAsset) =>
    // Same place in the gallery; keep a description already written, else take the image's own.
    onChange((current) =>
      current.map((image) => (image.key === key ? { ...image, url: asset.url, alt: image.alt || asset.altText } : image)),
    )

  const move = (from: number, to: number) =>
    onChange((current) => {
      if (to < 0 || to >= current.length || from === to) return current
      const next = [...current]
      const [image] = next.splice(from, 1)
      next.splice(to, 0, image)
      return next
    })

  const remove = (key: string) => {
    onChange((current) => current.filter((image) => image.key !== key))
    setConfirmingRemove(null)
  }

  const setAlt = (key: string, alt: string) =>
    onChange((current) => current.map((image) => (image.key === key ? { ...image, alt } : image)))

  // Drag-and-drop for mouse users; the arrow buttons do the same for keyboard and touch.
  const onDrop = (e: DragEvent, targetIndex: number) => {
    e.preventDefault()
    const from = images.findIndex((image) => image.key === dragKey)
    if (from >= 0) move(from, targetIndex)
    setDragKey(null)
    setDropKey(null)
  }

  const errorFor = (index: number) =>
    index === 0 ? errors.imageUrl : (errors[`additionalImages.${index - 1}.url`] ?? errors[`additionalImages.${index - 1}`])

  return (
    <fieldset>
      <legend className={labelClass}>Pictures</legend>
      <p className="mt-1 text-sm text-stone-500">
        The first picture is the main one, shown on the collection page. Drag pictures to reorder them, or use the
        arrows. {images.length} of {MAX_PRODUCT_IMAGES}.
      </p>
      {errors.imageUrl && images.length === 0 && <p className="mt-2 text-sm text-red-700">{errors.imageUrl}</p>}
      {errors.additionalImages && <p className="mt-2 text-sm text-red-700">{errors.additionalImages}</p>}

      {images.length > 0 && (
        <ol className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((image, i) => {
            const error = errorFor(i)
            return (
              <li
                key={image.key}
                draggable
                onDragStart={(e) => {
                  setDragKey(image.key)
                  e.dataTransfer.effectAllowed = 'move'
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDropKey(image.key)
                }}
                onDragLeave={() => setDropKey((k) => (k === image.key ? null : k))}
                onDrop={(e) => onDrop(e, i)}
                onDragEnd={() => {
                  setDragKey(null)
                  setDropKey(null)
                }}
                className={`flex flex-col rounded-md border bg-white p-2 ${
                  dropKey === image.key && dragKey !== image.key ? 'border-maroon ring-2 ring-maroon/30' : 'border-stone-200'
                } ${dragKey === image.key ? 'opacity-50' : ''}`}
              >
                <div className="relative cursor-grab overflow-hidden rounded bg-stone-100 active:cursor-grabbing">
                  <MediaImage src={image.url} className="aspect-[4/5] w-full object-cover" />
                  <span className="absolute top-1.5 left-1.5 rounded bg-white/90 px-1.5 py-0.5 text-xs font-medium text-stone-700">
                    {i === 0 ? 'Main picture' : `${i + 1}`}
                  </span>
                </div>

                <label htmlFor={`picture-alt-${image.key}`} className="mt-2 text-xs font-medium text-stone-600">
                  Description (for people who cannot see it)
                </label>
                <input
                  id={`picture-alt-${image.key}`}
                  value={image.alt}
                  maxLength={200}
                  onChange={(e) => setAlt(image.key, e.target.value)}
                  className={`${fieldClass} mt-1 py-1.5 sm:text-sm`}
                />
                {error && <p className="mt-1 text-sm text-red-700">{error}</p>}

                {confirmingRemove === image.key ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 rounded bg-red-50 p-2 text-sm text-red-900" role="group" aria-label="Confirm removal">
                    Remove this picture?
                    <button type="button" onClick={() => remove(image.key)} className={`${smallButton} border-red-300 text-red-800`}>
                      Remove
                    </button>
                    <button type="button" onClick={() => setConfirmingRemove(null)} className={smallButton}>
                      Keep
                    </button>
                  </div>
                ) : (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label={`Move picture ${i + 1} earlier`} className={smallButton}>
                      ←
                    </button>
                    <button
                      type="button"
                      onClick={() => move(i, i + 1)}
                      disabled={i === images.length - 1}
                      aria-label={`Move picture ${i + 1} later`}
                      className={smallButton}
                    >
                      →
                    </button>
                    {i > 0 && (
                      <button type="button" onClick={() => move(i, 0)} className={smallButton}>
                        Make main
                      </button>
                    )}
                    <button type="button" onClick={() => setLibrary({ mode: 'replace', key: image.key })} className={smallButton}>
                      Replace
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingRemove(image.key)}
                      aria-label={`Remove picture ${i + 1}`}
                      className={`${smallButton} text-red-700`}
                    >
                      Remove
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}

      <div className="mt-3 flex flex-wrap items-start gap-2">
        {full ? (
          <p className="text-sm text-stone-500">This product has the most pictures it can have.</p>
        ) : (
          <>
            <UploadButton onUploaded={add} multiple label={images.length ? 'Upload more pictures' : 'Upload pictures'} />
            <button type="button" onClick={() => setLibrary({ mode: 'add' })} className={secondaryButtonClass}>
              Choose from library
            </button>
          </>
        )}
      </div>
      <p className="mt-2 text-sm text-stone-500">
        JPEG, PNG or WebP. Large photos are made smaller (up to 2,400 px) before upload. Choose several at once — files
        named 1, 1.1, 1.2 are added in that order.
      </p>

      <MediaLibraryDialog
        open={library !== null}
        onClose={() => setLibrary(null)}
        onSelect={(asset) => {
          if (library?.mode === 'replace') replace(library.key, asset)
          else add(asset)
          setLibrary(null)
        }}
      />
    </fieldset>
  )
}
