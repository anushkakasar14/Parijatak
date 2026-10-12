import { Link } from 'react-router-dom'
import { HeroCarousel } from '../components/HeroCarousel'
import { InstagramSection } from '../components/InstagramSection'
import { Swatches } from '../components/Logo'
import { ProductCard } from '../components/ProductCard'
import { SectionHeading } from '../components/SectionHeading'
import { StorySection } from '../components/StorySection'
import { WhatsAppButton } from '../components/WhatsAppButton'
import { galleryItems, heroSlides } from '../data/media'
import { products } from '../data/products'
import { useSeo } from '../hooks/useSeo'
import { whatsappMessages } from '../lib/whatsapp'

// Staggered offsets give the featured row an editorial rhythm on desktop.
const featuredOffsets = ['', 'md:mt-20', 'md:mt-8']

export default function Home() {
  useSeo()

  return (
    <>
      <h1 className="sr-only">Parijatak — Handcrafted Home Textiles</h1>

      <HeroCarousel slides={heroSlides} />

      {/* Brand introduction */}
      <section className="container-page py-24 md:py-36">
        <Swatches className="mb-10 justify-center" />
        <SectionHeading
          eyebrow="Parijatak Home Textile Studio"
          title="Where tradition finds its place at home."
          align="center"
        >
          <p>
            Parijatak is a handcrafted home textile brand rooted in Indian traditional
            craftsmanship and made for the way we live now. We bring authentic textiles and
            thoughtful design together, so that the things you live with every day feel warm,
            comfortable and quietly artful.
          </p>
        </SectionHeading>
        <div className="mt-9 text-center">
          <Link to="/about" className="text-link">
            Discover Parijatak
          </Link>
        </div>
      </section>

      {/* Featured collection */}
      <section className="container-page pb-24 md:pb-36">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <SectionHeading eyebrow="Featured Collection" title="Textiles to live with." />
          <Link to="/collection" className="text-link">
            View the Collection
          </Link>
        </div>
        <div className="mt-12 grid gap-x-8 gap-y-14 md:mt-16 md:grid-cols-3">
          {products.map((product, i) => (
            <ProductCard key={product.id} product={product} className={featuredOffsets[i % 3]} />
          ))}
        </div>
      </section>

      {/* Craft / story */}
      <div className="border-t border-line">
        <StorySection
          eyebrow="Our Craft"
          title="Craft that carries a story."
          image="/media/craft-swatch.jpg"
          imageAlt="A small hand-woven sample in pink and natural yarn, lying on a worktable"
          action={
            <Link to="/about" className="btn btn-outline">
              Our Story
            </Link>
          }
        >
          <p>
            Every Parijatak textile begins with the hand. We work to preserve Indian craft — its
            skill, its patience, its character — while making it relevant to contemporary homes.
          </p>
          <p>
            The result is design that feels timeless rather than nostalgic: tradition you can
            live with, every day.
          </p>
        </StorySection>
      </div>

      {/* Personalized textiles */}
      <section className="bg-teal text-ivory">
        <div className="container-page grid items-end gap-10 py-20 md:grid-cols-[1.4fr_1fr] md:py-28">
          <SectionHeading eyebrow="Personalized Textiles" title="Made for your space." inverted>
            <p>
              Have a particular size, colour or idea in mind? Tell us about your home and what
              you are looking for — we welcome enquiries for personalized and custom textile
              requirements.
            </p>
          </SectionHeading>
          <div className="md:justify-self-end">
            <WhatsAppButton message={whatsappMessages.customization} variant="light">
              Talk to Us on WhatsApp
            </WhatsAppButton>
          </div>
        </div>
      </section>

      <InstagramSection items={galleryItems} />
    </>
  )
}
