import { Link } from 'react-router-dom'
import { SectionHeading } from '../components/SectionHeading'
import { useSeo } from '../hooks/useSeo'

export default function NotFound() {
  useSeo('Page not found — Parijatak')

  return (
    <section className="container-page py-28 text-center md:py-40">
      <SectionHeading as="h1" eyebrow="404" title="This page could not be found." align="center" />
      <Link to="/" className="btn btn-primary mt-9">
        Back to Home
      </Link>
    </section>
  )
}
