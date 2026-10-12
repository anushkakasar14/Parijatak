import { ContactForm } from '../components/ContactForm'
import { SectionHeading } from '../components/SectionHeading'
import { useSeo } from '../hooks/useSeo'

export default function Contact() {
  useSeo(
    'Contact Us — Parijatak',
    'Enquire about Parijatak home textiles, customization, styling and collaborations.',
  )

  return (
    <div className="container-page py-16 md:py-24">
      <section className="mx-auto max-w-2xl">
        <SectionHeading as="h1" eyebrow="Contact Us" title="Write to us." className="mb-10">
          <p>Tell us what you are looking for and we will get back to you.</p>
        </SectionHeading>
        <ContactForm />
      </section>
    </div>
  )
}
