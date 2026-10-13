import type { ReactNode } from 'react'
import type { SectionContent } from '../types'
import { Paragraphs } from './Content'
import { SectionHeading } from './SectionHeading'

interface StorySectionProps {
  /** Heading, text and image, as stored in the database. */
  content: SectionContent
  /** Which side the image sits on at desktop widths. */
  imageSide?: 'left' | 'right'
  /** On phones the image comes first by default; set false to show it after the text. */
  imageFirstOnMobile?: boolean
  aspect?: string
  /** Optional call to action rendered under the copy. */
  action?: ReactNode
}

/** Split editorial layout: large image on one side, heading and copy on the other. */
export function StorySection({
  content,
  imageSide = 'left',
  imageFirstOnMobile = true,
  aspect = 'aspect-[4/5]',
  action,
}: StorySectionProps) {
  const imageOrder = `${imageSide === 'right' ? 'md:order-2' : 'md:order-none'} ${
    imageFirstOnMobile ? '' : 'order-2'
  }`

  return (
    <section
      className={`container-page grid items-center gap-10 py-20 md:gap-16 md:py-28 lg:gap-24 ${
        content.imageUrl ? 'md:grid-cols-2' : ''
      }`}
    >
      {content.imageUrl && (
        <div className={`${aspect} overflow-hidden bg-cream ${imageOrder}`}>
          <img
            src={content.imageUrl}
            alt={content.imageAlt ?? ''}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
          />
        </div>
      )}
      <div>
        <SectionHeading eyebrow={content.eyebrow ?? undefined} title={content.heading}>
          {content.body && <Paragraphs text={content.body} />}
        </SectionHeading>
        {action && <div className="mt-8">{action}</div>}
      </div>
    </section>
  )
}
