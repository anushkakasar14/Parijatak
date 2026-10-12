import { INSTAGRAM_URL } from '../config/site'
import type { GalleryItem } from '../types'
import { InstagramIcon } from './Icons'
import { SectionHeading } from './SectionHeading'

interface InstagramSectionProps {
  items: GalleryItem[]
}

export function InstagramSection({ items }: InstagramSectionProps) {
  return (
    <section className="container-page py-20 md:py-28">
      <div className="flex flex-wrap items-end justify-between gap-6">
        <SectionHeading eyebrow="@studio_parijatk" title="From the studio" />
        <a
          href={INSTAGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="btn btn-outline"
        >
          <InstagramIcon />
          Follow Parijatak on Instagram
          <span className="sr-only"> (opens in a new tab)</span>
        </a>
      </div>

      <ul className="mt-10 grid gap-3 sm:grid-cols-3 md:mt-14 md:gap-5">
        {items.map((item) => (
          <li key={item.id} className="aspect-[4/5] overflow-hidden bg-cream">
            {item.video ? (
              <video
                src={item.video}
                poster={item.src}
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
                src={item.src}
                alt={item.alt}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
