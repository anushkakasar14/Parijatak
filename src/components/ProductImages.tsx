import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'
import { ChevronLeftIcon, ChevronRightIcon, CloseIcon, ExpandIcon } from './Icons'

interface GalleryImage {
  url: string
  alt: string
}

/** Shown in place of a picture that could not be loaded. */
function Unavailable({ className = '' }: { className?: string }) {
  return (
    <div className={`grid place-items-center bg-cream text-center text-sm text-muted ${className}`}>
      <span className="px-4">Image unavailable</span>
    </div>
  )
}

const arrowClass =
  'absolute top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-ivory/90 text-ink shadow-sm transition-colors hover:bg-ivory hover:text-maroon'

/**
 * A product's pictures: the selected one large and uncropped, with thumbnails beside it
 * on wide screens and in a scrolling row below on phones. Arrow keys, swipes and the
 * previous/next buttons change the picture; the expand button opens it full screen.
 * Pictures come from the product API, in the order set in the admin panel.
 */
export function ProductImages({ images, productName }: { images: GalleryImage[]; productName: string }) {
  const [index, setIndex] = useState(0)
  const [failed, setFailed] = useState<Record<string, true>>({})
  const [fullScreen, setFullScreen] = useState(false)
  const fullScreenRef = useRef<HTMLDialogElement>(null)
  const swipeStart = useRef<number | null>(null)

  const count = images.length
  const current = images[Math.min(index, count - 1)]
  const many = count > 1
  const go = (step: number) => setIndex((i) => (i + step + count) % count)
  const markFailed = (url: string) => setFailed((f) => ({ ...f, [url]: true }))
  const altFor = (image: GalleryImage, i: number) => image.alt || `${productName}, picture ${i + 1}`

  useEffect(() => {
    const dialog = fullScreenRef.current
    if (!dialog) return
    if (fullScreen && !dialog.open) dialog.showModal()
    if (!fullScreen && dialog.open) dialog.close()
  }, [fullScreen])

  const onKeyDown = (e: KeyboardEvent) => {
    if (!many) return
    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      go(-1)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      go(1)
    }
  }

  // Swipe on touch screens.
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') swipeStart.current = e.clientX
  }
  const onPointerUp = (e: PointerEvent) => {
    if (swipeStart.current === null || !many) return
    const distance = e.clientX - swipeStart.current
    swipeStart.current = null
    if (Math.abs(distance) > 40) go(distance < 0 ? 1 : -1)
  }

  if (!current) return <Unavailable className="aspect-[4/5] md:aspect-auto md:min-h-[36rem]" />

  const mainImage = (fit: 'contain-light' | 'contain-dark') =>
    failed[current.url] ? (
      <Unavailable className="h-full w-full" />
    ) : (
      <img
        src={current.url}
        alt={altFor(current, index)}
        onError={() => markFailed(current.url)}
        // Never cropped or stretched: the whole picture is shown at its own proportions.
        className={`h-full w-full object-contain ${fit === 'contain-dark' ? '' : 'bg-cream'}`}
      />
    )

  return (
    <div
      className="flex h-full flex-col bg-cream md:flex-row-reverse"
      role="group"
      aria-roledescription="gallery"
      aria-label={`Pictures of ${productName}`}
      onKeyDown={onKeyDown}
    >
      {/* Selected picture */}
      <div
        className="relative aspect-[4/5] md:aspect-auto md:min-h-[36rem] md:flex-1"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        {mainImage('contain-light')}

        <button
          type="button"
          onClick={() => setFullScreen(true)}
          aria-label="View full screen"
          className="absolute right-3 bottom-3 grid h-10 w-10 place-items-center rounded-full bg-ivory/90 text-ink shadow-sm transition-colors hover:bg-ivory hover:text-maroon"
        >
          <ExpandIcon width={18} height={18} />
        </button>

        {many && (
          <>
            <button type="button" onClick={() => go(-1)} aria-label="Previous picture" className={`${arrowClass} left-3`}>
              <ChevronLeftIcon />
            </button>
            <button type="button" onClick={() => go(1)} aria-label="Next picture" className={`${arrowClass} right-3`}>
              <ChevronRightIcon />
            </button>
            <p className="absolute bottom-3 left-3 rounded-full bg-ivory/90 px-2.5 py-1 text-xs tabular-nums" aria-live="polite">
              {index + 1} / {count}
            </p>
          </>
        )}
      </div>

      {/* Thumbnails: a column beside the picture on wide screens, a scrolling row below it on phones */}
      {many && (
        <ul
          className="flex shrink-0 gap-2 overflow-x-auto p-2 md:max-h-[36rem] md:w-24 md:flex-col md:overflow-x-visible md:overflow-y-auto"
          aria-label="Choose a picture"
        >
          {images.map((image, i) => (
            <li key={`${image.url}-${i}`} className="shrink-0">
              <button
                type="button"
                onClick={() => setIndex(i)}
                aria-label={`Show picture ${i + 1} of ${count}`}
                aria-current={i === index ? 'true' : undefined}
                className={`block h-16 w-16 overflow-hidden border-2 md:h-20 md:w-20 ${
                  i === index ? 'border-maroon' : 'border-transparent opacity-80 hover:opacity-100'
                }`}
              >
                {failed[image.url] ? (
                  <Unavailable className="h-full w-full text-[10px]" />
                ) : (
                  <img
                    src={image.url}
                    alt=""
                    loading="lazy"
                    onError={() => markFailed(image.url)}
                    className="h-full w-full object-cover"
                  />
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Full-screen view */}
      <dialog
        ref={fullScreenRef}
        aria-label={`${productName}, picture ${index + 1} of ${count}`}
        onClose={(e) => e.target === e.currentTarget && setFullScreen(false)}
        onKeyDown={onKeyDown}
        className="m-0 h-dvh max-h-none w-screen max-w-none bg-ink p-0 text-ivory backdrop:bg-ink"
      >
        {fullScreen && (
          <div className="relative h-full w-full" onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
            {mainImage('contain-dark')}
            <button
              type="button"
              onClick={() => setFullScreen(false)}
              aria-label="Close full screen"
              className="absolute top-3 right-3 grid h-11 w-11 place-items-center rounded-full bg-ivory text-ink"
            >
              <CloseIcon />
            </button>
            {many && (
              <>
                <button type="button" onClick={() => go(-1)} aria-label="Previous picture" className={`${arrowClass} left-3`}>
                  <ChevronLeftIcon />
                </button>
                <button type="button" onClick={() => go(1)} aria-label="Next picture" className={`${arrowClass} right-3`}>
                  <ChevronRightIcon />
                </button>
                <p className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-ivory/90 px-3 py-1 text-sm text-ink tabular-nums">
                  {index + 1} / {count}
                </p>
              </>
            )}
          </div>
        )}
      </dialog>
    </div>
  )
}
