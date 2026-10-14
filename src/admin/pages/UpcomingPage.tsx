import { PageHeader } from '../components'
import { cardClass } from '../ui'

interface UpcomingPageProps {
  title: string
  /** What this section will let an administrator do once it is built. */
  features: string[]
}

/**
 * Stands in for a content section whose backend does not exist yet. It says so plainly
 * rather than showing controls that would not save anything.
 */
export function UpcomingPage({ title, features }: UpcomingPageProps) {
  return (
    <>
      <PageHeader title={title} />
      <section className={`${cardClass} max-w-2xl`}>
        <p className="font-medium text-stone-900">This section is not available yet.</p>
        <p className="mt-1 text-stone-600">
          It is part of the next phase of work. Until then, this content is still changed in the
          website’s code. When it is ready you will be able to:
        </p>
        <ul className="mt-4 list-disc space-y-1.5 pl-5 text-stone-700">
          {features.map((feature) => (
            <li key={feature}>{feature}</li>
          ))}
        </ul>
      </section>
    </>
  )
}
