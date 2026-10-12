import type { ReactNode } from 'react'
import { SectionHeading } from './SectionHeading'

interface StorySectionProps {
  eyebrow?: string
  title: string
  image: string
  imageAlt: string
  /** Which side the image sits on at desktop widths. */
  imageSide?: 'left' | 'right'
  aspect?: string
  children: ReactNode
  /** Optional call to action rendered under the copy. */
  action?: ReactNode
}

/** Split editorial layout: large image on one side, heading and copy on the other. */
export function StorySection({
  eyebrow,
  title,
  image,
  imageAlt,
  imageSide = 'left',
  aspect = 'aspect-[4/5]',
  children,
  action,
}: StorySectionProps) {
  return (
    <section className="container-page grid items-center gap-10 py-20 md:grid-cols-2 md:gap-16 md:py-28 lg:gap-24">
      <div className={`${aspect} overflow-hidden bg-cream ${imageSide === 'right' ? 'md:order-2' : ''}`}>
        <img
          src={image}
          alt={imageAlt}
          loading="lazy"
          decoding="async"
          className="h-full w-full object-cover"
        />
      </div>
      <div>
        <SectionHeading eyebrow={eyebrow} title={title}>
          {children}
        </SectionHeading>
        {action && <div className="mt-8">{action}</div>}
      </div>
    </section>
  )
}
