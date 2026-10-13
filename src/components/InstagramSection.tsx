import { useSite } from '../context/SiteContext'
import type { GalleryItem, SectionContent } from '../types'
import { InstagramIcon } from './Icons'
import { SectionHeading } from './SectionHeading'

interface InstagramSectionProps {
  /** Heading and button wording. */
  content: SectionContent
  items: GalleryItem[]
}

export function InstagramSection({ content, items }: InstagramSectionProps) {
  const { settings } = useSite()
  const instagram = settings.social.instagram

  return (
    <section className="container-page py-20 md:py-28">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <SectionHeading eyebrow={content.eyebrow ?? undefined} title={content.heading} />
        {instagram && content.ctaLabel && (
          <a href={instagram} target="_blank" rel="noopener noreferrer" className="btn btn-outline">
            <InstagramIcon />
            {content.ctaLabel}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        )}
      </div>

      {items.length > 0 && (
        <ul className="mt-10 grid gap-3 sm:grid-cols-3 md:mt-14 md:gap-5">
          {items.map((item) => (
            <li key={item.imageUrl + item.videoUrl} className="aspect-[4/5] overflow-hidden bg-cream">
              {item.videoUrl ? (
                <video
                  src={item.videoUrl}
                  poster={item.imageUrl}
                  aria-label={item.alt}
                  autoPlay
                  muted
                  loop
                  playsInline
                  preload="metadata"
                  className="h-full w-full object-cover"
                />
              ) : (
                <img
                  src={item.imageUrl}
                  alt={item.alt}
                  loading="lazy"
                  decoding="async"
                  className="h-full w-full object-cover"
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
