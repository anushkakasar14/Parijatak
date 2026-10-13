import { Link } from 'react-router-dom'
import { FadeIn, LoadError, Paragraphs, SmartLink } from '../components/Content'
import { HeroCarousel, HeroFallback, HeroPlaceholder } from '../components/HeroCarousel'
import { InstagramSection } from '../components/InstagramSection'
import { Swatches } from '../components/Logo'
import { ProductCard, ProductCardSkeleton } from '../components/ProductCard'
import { SectionHeading } from '../components/SectionHeading'
import { StorySection } from '../components/StorySection'
import { WhatsAppButton } from '../components/WhatsAppButton'
import { usePageSections } from '../context/SiteContext'
import { useResource } from '../hooks/useResource'
import { useSeo } from '../hooks/useSeo'
import { whatsappMessages } from '../lib/whatsapp'
import type { HomepageData, Offer, Product } from '../types'

// Staggered offsets give the featured row an editorial rhythm on desktop.
const featuredOffsets = ['', 'md:mt-20', 'md:mt-8']
const FEATURED_COUNT = 3

/** A slim announcement band. Rendered only while an offer is published and in date. */
function OfferBanner({ offer }: { offer: Offer }) {
  return (
    <aside aria-label="Current offer" className="bg-maroon text-ivory">
      <div className="container-page flex flex-wrap items-center justify-center gap-x-5 gap-y-2 py-3 text-center text-sm">
        <p>
          <strong className="font-medium">{offer.title}</strong>
          {offer.discountText && <span> — {offer.discountText}</span>}
          {offer.description && <span className="text-ivory/85"> · {offer.description}</span>}
        </p>
        {offer.ctaLabel && (
          <SmartLink to={offer.ctaUrl} className="underline underline-offset-4 hover:text-ivory/80">
            {offer.ctaLabel}
          </SmartLink>
        )}
      </div>
    </aside>
  )
}

function FeaturedProducts() {
  const { data: products, status, retry } = useResource<Product[]>('/products')

  if (status === 'error') {
    return <LoadError message="The collection could not be loaded." onRetry={retry} />
  }

  if (status === 'loading') {
    return (
      <div role="status" aria-label="Loading products" className="grid gap-x-8 gap-y-14 md:grid-cols-3">
        {featuredOffsets.map((offset) => (
          <ProductCardSkeleton key={offset} className={offset} />
        ))}
      </div>
    )
  }

  // Featured products first; if none are marked, the first few of the collection.
  const all = products ?? []
  const featured = all.filter((p) => p.isFeatured)
  const shown = (featured.length ? featured : all).slice(0, FEATURED_COUNT)

  if (shown.length === 0) {
    return <p className="text-muted">New pieces are on their way — please check back soon.</p>
  }

  return (
    <div className="grid gap-x-8 gap-y-14 md:grid-cols-3">
      {shown.map((product, i) => (
        <ProductCard key={product.id} product={product} className={featuredOffsets[i % 3]} />
      ))}
    </div>
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

      {home.data?.offers.map((offer) => <OfferBanner key={offer.id} offer={offer} />)}

      <FadeIn ready={ready}>
        {/* Brand introduction */}
        <section className="container-page py-24 md:py-36">
          <Swatches className="mb-10 justify-center" />
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
        <section className="bg-teal text-ivory">
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
