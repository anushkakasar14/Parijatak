import { useCallback, useEffect, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { Link } from 'react-router-dom'
import type { Slide } from '../types'
import { ChevronLeftIcon, ChevronRightIcon, PauseIcon, PlayIcon } from './Icons'
import { MediaSlide } from './MediaSlide'

const AUTOPLAY_MS = 6500

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

interface HeroCarouselProps {
  slides: Slide[]
}

export function HeroCarousel({ slides }: HeroCarouselProps) {
  const [index, setIndex] = useState(0)
  const [playing, setPlaying] = useState(() => !prefersReducedMotion())
  // Hover or keyboard focus inside the carousel holds the current slide.
  const [held, setHeld] = useState(false)

  const count = slides.length
  const go = useCallback((to: number) => setIndex((to + count) % count), [count])

  const autoplaying = playing && !held

  useEffect(() => {
    if (!autoplaying) return
    const timer = window.setTimeout(() => go(index + 1), AUTOPLAY_MS)
    return () => window.clearTimeout(timer)
  }, [autoplaying, index, go])

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'ArrowLeft') go(index - 1)
    if (e.key === 'ArrowRight') go(index + 1)
  }

  const current = slides[index]
  const arrowClass =
    'absolute top-[40%] z-10 grid h-11 w-11 -translate-y-1/2 place-items-center text-ivory/75 drop-shadow-[0_1px_2px_rgb(0_0_0/0.5)] transition-colors hover:text-ivory'

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Parijatak highlights"
      // Navbar (5rem / 6rem + 1px border) plus the carousel fill exactly one screen.
      className="relative h-[calc(100svh-5rem-1px)] min-h-72 overflow-hidden bg-cream md:h-[calc(100svh-6rem-1px)]"
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
      onKeyDown={onKeyDown}
    >
      {slides.map((slide, i) => (
        <div
          key={slide.id}
          role="group"
          aria-roledescription="slide"
          aria-label={`${i + 1} of ${count}`}
          aria-hidden={i !== index}
          className={`absolute inset-0 transition-opacity duration-1000 ease-in-out ${
            i === index ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <MediaSlide slide={slide} active={i === index} priority={i === 0} />
        </div>
      ))}

      <button
        type="button"
        onClick={() => go(index - 1)}
        aria-label="Previous slide"
        className={`${arrowClass} left-1 md:left-4`}
      >
        <ChevronLeftIcon className="h-6 w-6 md:h-7 md:w-7" strokeWidth={1.25} />
      </button>
      <button
        type="button"
        onClick={() => go(index + 1)}
        aria-label="Next slide"
        className={`${arrowClass} right-1 md:right-4`}
      >
        <ChevronRightIcon className="h-6 w-6 md:h-7 md:w-7" strokeWidth={1.25} />
      </button>

      {/* Caption along the bottom edge of the media; the soft scrim keeps it readable on any photo */}
      <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-ink/80 via-ink/45 to-transparent pt-24 text-ivory">
        <div className="container-page flex flex-wrap items-end justify-between gap-x-10 gap-y-5 pb-6 md:pb-10">
          <div aria-live={autoplaying ? 'off' : 'polite'} className="max-w-2xl">
            {current.eyebrow && <p className="eyebrow mb-3 text-ivory/85">{current.eyebrow}</p>}
            <h2 className="text-4xl md:text-6xl">{current.heading}</h2>
            {current.description && (
              <p className="mt-3 max-w-md text-ivory/90 md:text-lg">
                {current.description}
              </p>
            )}
            {current.cta && (
              <Link to={current.cta.to} className="btn btn-light mt-5 md:mt-7">
                {current.cta.label}
              </Link>
            )}
          </div>

          <div className="flex items-center gap-2">
            <div className="flex" role="group" aria-label="Choose slide">
              {slides.map((slide, i) => (
                <button
                  key={slide.id}
                  type="button"
                  onClick={() => go(i)}
                  aria-label={`Go to slide ${i + 1}`}
                  aria-current={i === index ? 'true' : undefined}
                  className="group grid h-11 w-8 place-items-center"
                >
                  <span
                    className={`block h-0.5 w-6 transition-colors ${
                      i === index ? 'bg-ivory' : 'bg-ivory/40 group-hover:bg-ivory/70'
                    }`}
                  />
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? 'Pause slideshow' : 'Play slideshow'}
              className="grid h-11 w-11 place-items-center border border-ivory/50 transition-colors hover:bg-ivory hover:text-ink"
            >
              {playing ? <PauseIcon /> : <PlayIcon />}
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
