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

  const mediaClass = 'h-full w-full object-cover'

  if (slide.type === 'video' && slide.src) {
    return (
      <video
        ref={videoRef}
        className={mediaClass}
        src={slide.src}
        poster={slide.poster}
        aria-label={slide.alt}
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
      src={slide.type === 'video' ? slide.poster : slide.src}
      alt={slide.alt}
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding="async"
    />
  )
}
