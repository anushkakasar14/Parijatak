import { site } from '../config/site'
import { useSite } from '../context/SiteContext'

interface LogoProps {
  className?: string
}

/** Renders the supplied Parijatak logo file as-is. */
export function Logo({ className = 'h-[4.5rem] md:h-[5.75rem]' }: LogoProps) {
  const { settings } = useSite()
  return <img src={site.logoSrc} alt={settings.brand.name} className={`${className} w-auto`} />
}

/**
 * A small divider drawn from the logo's dotted ring: a diamond between two dots and two
 * fine antique-gold rules. Used sparingly, to open a section.
 */
export function Ornament({
  className = '',
  align = 'center',
}: {
  className?: string
  align?: 'center' | 'start'
}) {
  return (
    <span
      className={`flex items-center gap-3 text-gold ${align === 'center' ? 'justify-center' : 'justify-start'} ${className}`}
      aria-hidden="true"
    >
      <span className="h-px w-12 bg-gold/60 md:w-20" />
      <svg viewBox="0 0 40 12" width="40" height="12" fill="currentColor">
        <circle cx="4" cy="6" r="1.6" />
        <path d="M20 1l5 5-5 5-5-5z" />
        <circle cx="36" cy="6" r="1.6" />
      </svg>
      <span className="h-px w-12 bg-gold/60 md:w-20" />
    </span>
  )
}

/** Five thread-swatches in the logo colours. */
export function Swatches({ className = '' }: { className?: string }) {
  return (
    <span className={`flex gap-1.5 ${className}`} aria-hidden="true">
      {['bg-teal', 'bg-maroon', 'bg-leaf', 'bg-mustard', 'bg-coral'].map((color) => (
        <span key={color} className={`h-1.5 w-6 ${color}`} />
      ))}
    </span>
  )
}
