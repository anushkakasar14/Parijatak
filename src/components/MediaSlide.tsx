import { useEffect, useRef } from 'react'
import type { Slide } from '../types'

interface MediaSlideProps {
  slide: Slide
  active: boolean
  /** First slide loads eagerly; the rest are lazy. */
  priority?: boolean
}

export function MediaSlide({ slide, active, priority = false }: MediaSlideProps) {
  const videoRef = useRef<HTMLVideoElement>(null)

  // Only the visible slide's film plays.
  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    if (active) video.play().catch(() => {})
    else video.pause()
  }, [active])

  // The whole picture or film, centred, at its own proportions: never stretched or cropped.
  // Where its shape differs from the frame, the frame colour shows around it.
  const mediaClass = 'h-full w-full object-contain object-center'

  if (slide.mediaType === 'video') {
    return (
      <video
        ref={videoRef}
        className={mediaClass}
        src={slide.mediaUrl}
        poster={slide.posterUrl ?? undefined}
        aria-label={slide.altText}
        muted
        loop
        playsInline
        preload="none"
      />
    )
  }

  return (
    <img
      className={mediaClass}
      src={slide.mediaUrl}
      alt={slide.altText}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
    />
  )
}
