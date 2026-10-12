import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Swatches } from '../components/Logo'
import { SectionHeading } from '../components/SectionHeading'
import { SocialLinks } from '../components/SocialLinks'
import { StorySection } from '../components/StorySection'
import { WhatsAppButton } from '../components/WhatsAppButton'
import { useSeo } from '../hooks/useSeo'
import { whatsappMessages } from '../lib/whatsapp'

/**
 * Visibly marks copy that is waiting on confirmed details from Parijatak.
 * Replace the children with final content and remove the wrapper before launch.
 */
function EditablePlaceholder({ children }: { children: ReactNode }) {
  return (
    <div className="border border-dashed border-maroon/60 p-5 text-base text-ink">
      <p className="eyebrow mb-2 text-maroon">Editable placeholder</p>
      {children}
    </div>
  )
}

export default function About() {
  useSeo(
    'About — Parijatak',
    'The story of Parijatak: Indian traditional craftsmanship, thoughtfully designed for contemporary homes.',
  )

  return (
    <>
      {/* 1. Brand introduction */}
      <section className="container-page py-20 md:py-32">
        <Swatches className="mb-10" />
        <h1 className="max-w-5xl text-5xl md:text-7xl lg:text-[5.25rem]">
          Where home feels comfort, authentic, <em className="text-teal">and artful.</em>
        </h1>
        <p className="mt-10 max-w-2xl text-lg text-muted md:text-xl">
          Parijatak is a handcrafted home textile brand rooted in Indian traditional craftsmanship
          and open to the way we live today. We make textiles for the home that carry warmth,
          comfort and artistic expression — premium in quality, approachable in spirit.
        </p>
      </section>

      {/* 2. Our philosophy */}
      <div className="border-t border-line">
        <StorySection
          eyebrow="01 — Our Philosophy"
          title="Timeless, not nostalgic."
          image="/media/shoot-checks.jpg"
          imageAlt="A black and natural checked Parijatak throw hanging from a tree branch in a garden"
          imageSide="right"
        >
          <p>
            We believe a home should feel honest. That means textiles that are authentic in how
            they are made, simple in how they are designed, and comfortable in how they are
            lived with.
          </p>
          <p>
            Our work sits where tradition and contemporary simplicity meet: timeless design that
            respects where it comes from and belongs in the homes of today.
          </p>
        </StorySection>
      </div>

      {/* 3. Craft & artisans */}
      <section className="bg-cream">
        <div className="container-page grid gap-10 py-20 md:grid-cols-2 md:gap-16 md:py-28 lg:gap-24">
          <SectionHeading eyebrow="02 — Craft & Artisans" title="Made by hand, with care." />
          <div className="space-y-5 text-base text-muted md:text-lg">
            <p>
              Human craftsmanship is at the heart of Parijatak. We work to preserve Indian craft
              by giving it a living place in everyday homes — valuing the skill, time and
              individuality that only the hand can bring.
            </p>
            <EditablePlaceholder>
              <p>
                Add confirmed details here: the craft techniques used, the artisans or
                communities Parijatak works with, and where the textiles are made.
              </p>
            </EditablePlaceholder>
          </div>
        </div>
      </section>

      {/* 4. Contemporary living */}
      <StorySection
        eyebrow="03 — Contemporary Living"
        title="Designed for today."
        image="/media/shoot-bench.jpg"
        imageAlt="A checked Parijatak throw draped over a wooden garden bench in evening light"
        aspect="aspect-[4/3]"
      >
        <p>
          Tradition matters most when it is used. Our bed linens, cushion covers and throws are
          designed with contemporary simplicity, so that craft sits naturally in modern spaces
          and in the rhythm of daily life.
        </p>
      </StorySection>

      {/* 5. Personalized design */}
      <section className="bg-teal text-ivory">
        <div className="container-page grid items-end gap-10 py-20 md:grid-cols-[1.4fr_1fr] md:py-28">
          <SectionHeading eyebrow="04 — Personalized Design" title="Made for your space." inverted>
            <p>
              Every home is different. We welcome enquiries for personalized and custom textile
              requirements — share your space and your ideas, and we will take it from there.
            </p>
          </SectionHeading>
          <div className="md:justify-self-end">
            <WhatsAppButton message={whatsappMessages.customization} variant="light">
              Talk to Us on WhatsApp
            </WhatsAppButton>
          </div>
        </div>
      </section>

      {/* 6. Founder */}
      <StorySection
        eyebrow="05 — Founder"
        title="The person behind Parijatak."
        image="/media/about-founder.jpg"
        imageAlt="The founder of Parijatak standing in front of a carved wooden door, surrounded by plants"
        imageSide="right"
      >
        <EditablePlaceholder>
          <p>
            Add the founder’s name, portrait and a short note in their own words — why Parijatak
            began and what they hope it brings to a home.
          </p>
        </EditablePlaceholder>
      </StorySection>

      {/* 7. Social links */}
      <section className="border-t border-line">
        <div className="container-page flex flex-wrap items-end justify-between gap-8 py-16 md:py-20">
          <SectionHeading eyebrow="06 — Follow Along" title="See the studio at work." />
          <SocialLinks variant="buttons" />
        </div>
      </section>

      {/* 8. Contact CTA */}
      <section className="bg-cream">
        <div className="container-page py-20 text-center md:py-28">
          <SectionHeading title="Let’s make your home feel like you." align="center">
            <p>Questions, custom requirements or collaborations — we would love to hear from you.</p>
          </SectionHeading>
          <Link to="/contact" className="btn btn-primary mt-9">
            Contact Us
          </Link>
        </div>
      </section>
    </>
  )
}
