import { CollectionGrid } from '../components/CollectionGrid'
import { SectionHeading } from '../components/SectionHeading'
import { WhatsAppButton } from '../components/WhatsAppButton'
import { products } from '../data/products'
import { useSeo } from '../hooks/useSeo'
import { whatsappMessages } from '../lib/whatsapp'

export default function Collection() {
  useSeo(
    'The Collection — Parijatak',
    'Thoughtfully crafted bed linens, cushion covers and throws for spaces that feel like home.',
  )

  return (
    <>
      <section className="container-page pt-16 pb-14 md:pt-24 md:pb-20">
        <SectionHeading as="h1" eyebrow="Parijatak" title="The Collection">
          <p>Thoughtfully crafted textiles for spaces that feel like home.</p>
        </SectionHeading>
      </section>

      <section aria-label="Products" className="container-page pb-24 md:pb-36">
        <CollectionGrid products={products} />
      </section>

      <section className="border-t border-line">
        <div className="container-page flex flex-wrap items-center justify-between gap-8 py-16 md:py-20">
          <SectionHeading title="Looking for something particular?">
            <p>We take enquiries and orders personally over WhatsApp.</p>
          </SectionHeading>
          <WhatsAppButton message={whatsappMessages.customization}>
            Talk to Us on WhatsApp
          </WhatsAppButton>
        </div>
      </section>
    </>
  )
}
