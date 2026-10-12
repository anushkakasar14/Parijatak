import { Link } from 'react-router-dom'
import { ContactForm } from '../components/ContactForm'
import { Swatches } from '../components/Logo'
import { SectionHeading } from '../components/SectionHeading'
import { SocialLinks } from '../components/SocialLinks'
import { useSeo } from '../hooks/useSeo'

export default function Contact() {
  useSeo(
    'Contact Us — Parijatak',
    'Enquire about Parijatak home textiles, customization, styling and collaborations.',
  )

  return (
    <div className="container-page grid gap-16 py-16 md:py-24 lg:grid-cols-[1.15fr_1fr] lg:gap-24">
      <section>
        <SectionHeading as="h1" eyebrow="Contact Us" title="Write to us." className="mb-10">
          <p>Tell us what you are looking for and we will get back to you.</p>
        </SectionHeading>
        <ContactForm />
      </section>

      <aside className="self-start border border-line bg-cream p-8 md:p-10 lg:sticky lg:top-32">
        <Swatches className="mb-7" />
        <h2 className="text-4xl">About Parijatak</h2>
        <p className="mt-5 text-muted">
          Parijatak is a handcrafted home textile brand rooted in Indian traditional craftsmanship
          and designed for contemporary living — a studio where home feels comfortable, authentic
          and artful.
        </p>
        <Link to="/about" className="btn btn-primary mt-7">
          Read Our Story
        </Link>
        <SocialLinks variant="buttons" className="mt-3" />
      </aside>
    </div>
  )
}
