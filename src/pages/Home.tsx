import { Link } from 'react-router-dom'
import { FadeIn, Paragraphs, SmartLink } from '../components/Content'
import { FeaturedProducts } from '../components/FeaturedProducts'
import { HeroCarousel, HeroFallback, HeroPlaceholder } from '../components/HeroCarousel'
import { InstagramSection } from '../components/InstagramSection'
import { Ornament } from '../components/Logo'
import { SectionHeading } from '../components/SectionHeading'
import { StorySection } from '../components/StorySection'
import { WhatsAppButton } from '../components/WhatsAppButton'
import { usePageSections } from '../context/SiteContext'
import { useResource } from '../hooks/useResource'
import { useSeo } from '../hooks/useSeo'
import { whatsappMessages } from '../lib/whatsapp'
import type { HomepageData, Offer } from '../types'

/** A slim announcement band. Rendered only while an offer is published and in date. */
function OfferBanner({ offer }: { offer: Offer }) {
  return (
    <aside aria-label="Current offer" className="border-b border-gold/40 bg-cream text-ink">
      <div className="container-page flex flex-wrap items-center justify-center gap-x-5 gap-y-2 py-3 text-center text-sm">
        {offer.bannerImageUrl && (
          <img
            src={offer.bannerImageUrl}
            alt={offer.bannerImageAlt ?? ''}
            className="h-12 w-12 shrink-0 rounded-full border border-gold/40 object-cover"
          />
        )}
        <p>
          <strong className="font-medium">{offer.title}</strong>
          {offer.discountText && <span> — {offer.discountText}</span>}
          {offer.description && <span className="text-muted"> · {offer.description}</span>}
        </p>
        {offer.ctaLabel && (
          <SmartLink to={offer.ctaUrl} className="font-medium text-maroon underline underline-offset-4 hover:text-maroon-deep">
            {offer.ctaLabel}
          </SmartLink>
        )}
      </div>
    </aside>
  )
}

export default function Home() {
  useSeo()
  const home = useResource<HomepageData>('/homepage')
  const { section, ready } = usePageSections('home')

  const intro = section('home.intro')
  const featured = section('home.featured')
  const craft = section('home.craft')
  const custom = section('home.custom')
  const slides = home.data?.slides ?? []

  return (
    <>
      <h1 className="sr-only">Parijatak — Handcrafted Home Textiles</h1>

      {/* A margin on all four sides; the carousel fills the rest of the first screen */}
      <div className="hero-frame">
        {home.status === 'loading' ? (
          <HeroPlaceholder />
        ) : slides.length > 0 ? (
          <HeroCarousel slides={slides} />
        ) : (
          <HeroFallback>
            <Link to="/collection" className="btn btn-primary">
              Explore Collection
            </Link>
          </HeroFallback>
        )}
      </div>

      {home.data?.offers.map((offer) => <OfferBanner key={offer.id} offer={offer} />)}

      <FadeIn ready={ready}>
        {/* Brand introduction */}
        <section className="container-page py-24 md:py-36">
          <Ornament className="mb-10" />
          <SectionHeading eyebrow={intro.eyebrow ?? undefined} title={intro.heading} align="center">
            <Paragraphs text={intro.body} />
          </SectionHeading>
          {intro.ctaLabel && (
            <div className="mt-9 text-center">
              <SmartLink to={intro.ctaUrl} className="text-link">
                {intro.ctaLabel}
              </SmartLink>
            </div>
          )}
        </section>

        {/* Featured collection */}
        <section className="container-page pb-24 md:pb-36">
          <div className="mb-12 flex flex-wrap items-end justify-between gap-6 md:mb-16">
            <SectionHeading eyebrow={featured.eyebrow ?? undefined} title={featured.heading} />
            {featured.ctaLabel && (
              <SmartLink to={featured.ctaUrl} className="text-link">
                {featured.ctaLabel}
              </SmartLink>
            )}
          </div>
          <FeaturedProducts />
        </section>

        {/* Craft / story */}
        <div className="border-t border-line">
          <StorySection
            content={craft}
            imageSide="right"
            imageFirstOnMobile={false}
            action={
              craft.ctaLabel && (
                <SmartLink to={craft.ctaUrl} className="btn btn-outline">
                  {craft.ctaLabel}
                </SmartLink>
              )
            }
          />
        </div>

        {/* Personalized textiles */}
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

        <InstagramSection content={section('home.studio')} items={home.data?.gallery ?? []} />
      </FadeIn>
    </>
  )
}
