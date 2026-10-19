import { useSearchParams } from 'react-router-dom'
import { CollectionGrid } from '../components/CollectionGrid'
import { FadeIn, LoadError, Paragraphs } from '../components/Content'
import { ProductCardSkeleton } from '../components/ProductCard'
import { SectionHeading } from '../components/SectionHeading'
import { WhatsAppButton } from '../components/WhatsAppButton'
import { usePageSections } from '../context/SiteContext'
import { useResource } from '../hooks/useResource'
import { pageSeo } from '../config/seo'
import { useSeo } from '../hooks/useSeo'
import { whatsappMessages } from '../lib/whatsapp'
import type { Category, Product } from '../types'

export default function Collection() {
  useSeo(pageSeo.collection.title, pageSeo.collection.description)

  const { section, ready } = usePageSections('collection')
  const products = useResource<Product[]>('/products')
  const categories = useResource<Category[]>('/categories')
  const [params, setParams] = useSearchParams()

  const intro = section('collection.intro')
  const contact = section('collection.contact')

  // The chosen category lives in the URL, so a filtered view can be shared or refreshed.
  const chosen = params.get('category') ?? ''
  const all = products.data ?? []
  const options = (categories.data ?? []).filter((c) => all.some((p) => p.categoryId === c.id))
  const active = options.some((c) => c.id === chosen) ? chosen : ''
  const shown = active ? all.filter((p) => p.categoryId === active) : all

  const choose = (id: string) => setParams(id ? { category: id } : {}, { replace: true })

  const chipClass = (selected: boolean) =>
    `rounded-full border px-5 py-2 text-[0.8125rem] font-medium tracking-[0.14em] uppercase transition-colors ${
      selected ? 'border-maroon bg-maroon text-ivory' : 'border-ink/25 hover:border-maroon hover:text-maroon'
    }`

  return (
    <>
      <section className="container-page pt-16 pb-14 md:pt-24 md:pb-20">
        <FadeIn ready={ready}>
          <SectionHeading as="h1" eyebrow={intro.eyebrow ?? undefined} title={intro.heading}>
            <Paragraphs text={intro.body} />
          </SectionHeading>
        </FadeIn>

        {options.length > 1 && (
          <div role="group" aria-label="Filter by category" className="mt-10 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => choose('')}
              aria-pressed={!active}
              className={chipClass(!active)}
            >
              All
            </button>
            {options.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => choose(category.id)}
                aria-pressed={active === category.id}
                className={chipClass(active === category.id)}
              >
                {category.name}
              </button>
            ))}
          </div>
        )}
      </section>

      <section aria-label="Products" className="container-page pb-24 md:pb-36">
        {products.status === 'error' ? (
          <LoadError message="The collection could not be loaded." onRetry={products.retry} />
        ) : products.status === 'loading' ? (
          <div
            role="status"
            aria-label="Loading products"
            className="grid gap-x-8 gap-y-14 sm:grid-cols-2 lg:grid-cols-3"
          >
            {[0, 1, 2].map((i) => (
              <ProductCardSkeleton key={i} />
            ))}
          </div>
        ) : shown.length === 0 ? (
          <p className="border border-line bg-cream px-6 py-14 text-center font-display text-2xl">
            New pieces are on their way — please check back soon.
          </p>
        ) : (
          <CollectionGrid products={shown} />
        )}
      </section>

      <section className="border-t border-line">
        <FadeIn ready={ready}>
          <div className="container-page flex flex-wrap items-center justify-between gap-8 py-16 md:py-20">
            <SectionHeading title={contact.heading}>
              <Paragraphs text={contact.body} />
            </SectionHeading>
            {contact.ctaLabel && (
              <WhatsAppButton message={whatsappMessages.customization}>
                {contact.ctaLabel}
              </WhatsAppButton>
            )}
          </div>
        </FadeIn>
      </section>
    </>
  )
}
