import { FadeIn, Paragraphs, SmartLink } from '../components/Content'
import { Ornament } from '../components/Logo'
import { SectionHeading } from '../components/SectionHeading'
import { SocialLinks } from '../components/SocialLinks'
import { StorySection } from '../components/StorySection'
import { WhatsAppButton } from '../components/WhatsAppButton'
import { usePageSections } from '../context/SiteContext'
import { useSeo } from '../hooks/useSeo'
import { whatsappMessages } from '../lib/whatsapp'

/**
 * The page's opening line sets its last clause in maroon italics
 * ("…authentic, *and artful.*"). The split is made at the final comma, so the
 * treatment survives the wording being edited.
 */
function AccentHeading({ text }: { text: string }) {
  const comma = text.lastIndexOf(',')
  if (comma === -1) return <>{text}</>
  return (
    <>
      {text.slice(0, comma + 1)} <em className="text-maroon">{text.slice(comma + 1).trim()}</em>
    </>
  )
}

export default function About() {
  useSeo(
    'About — Parijatak',
    'The story of Parijatak: Indian traditional craftsmanship, thoughtfully designed for contemporary homes.',
  )

  const { section, ready } = usePageSections('about')
  const intro = section('about.intro')
  const craft = section('about.craft')
  const custom = section('about.custom')
  const social = section('about.social')
  const contact = section('about.contact')

  return (
    <FadeIn ready={ready}>
      {/* 1. Brand introduction */}
      <section className="container-page py-20 md:py-32">
        <Ornament className="mb-10" align="start" />
        <h1 className="max-w-5xl text-5xl md:text-7xl lg:text-[5.25rem]">
          <AccentHeading text={intro.heading} />
        </h1>
        <div className="mt-10 max-w-2xl space-y-4 text-lg text-muted md:text-xl">
          <Paragraphs text={intro.body} />
        </div>
      </section>

      {/* 2. Our philosophy */}
      <div className="border-t border-line">
        <StorySection content={section('about.philosophy')} imageSide="right" />
      </div>

      {/* 3. Craft & artisans */}
      <section className="bg-cream">
        <div className="container-page grid gap-10 py-20 md:grid-cols-2 md:gap-16 md:py-28 lg:gap-24">
          <SectionHeading eyebrow={craft.eyebrow ?? undefined} title={craft.heading} />
          <div className="space-y-5 text-base text-muted md:text-lg">
            <Paragraphs text={craft.body} />
          </div>
        </div>
      </section>

      {/* 4. Contemporary living */}
      <StorySection content={section('about.living')} aspect="aspect-[4/3]" />

      {/* 5. Personalized design */}
      <section className="bg-maroon text-ivory">
        <div className="container-page grid items-end gap-10 py-20 md:grid-cols-[1.4fr_1fr] md:py-28">
          <SectionHeading eyebrow={custom.eyebrow ?? undefined} title={custom.heading} inverted>
            <Paragraphs text={custom.body} />
          </SectionHeading>
          {custom.ctaLabel && (
            <div className="md:justify-self-end">
              <WhatsAppButton message={whatsappMessages.customization} variant="light">
                {custom.ctaLabel}
              </WhatsAppButton>
            </div>
          )}
        </div>
      </section>

      {/* 6. Founder */}
      <StorySection content={section('about.founder')} imageSide="right" />

      {/* 7. Social links */}
      <section className="border-t border-line">
        <div className="container-page flex flex-wrap items-end justify-between gap-8 py-16 md:py-20">
          <SectionHeading eyebrow={social.eyebrow ?? undefined} title={social.heading} />
          <SocialLinks variant="buttons" />
        </div>
      </section>

      {/* 8. Contact CTA */}
      <section className="bg-cream">
        <div className="container-page py-20 text-center md:py-28">
          <SectionHeading title={contact.heading} align="center">
            <Paragraphs text={contact.body} />
          </SectionHeading>
          {contact.ctaLabel && (
            <SmartLink to={contact.ctaUrl} className="btn btn-primary mt-9">
              {contact.ctaLabel}
            </SmartLink>
          )}
        </div>
      </section>
    </FadeIn>
  )
}
