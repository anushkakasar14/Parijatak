import { site } from '../config/site'

interface LogoProps {
  className?: string
}

/**
 * Renders the supplied Parijatak logo file as-is. Until `site.logoSrc` is set,
 * a neutral text wordmark stands in — it is not a redesign of the logo.
 */
export function Logo({ className = 'h-[4.5rem] md:h-[5.75rem]' }: LogoProps) {
  if (site.logoSrc) {
    // The supplied file has a white background; multiply lets the page colour show through it.
    return (
      <img src={site.logoSrc} alt={site.name} className={`${className} w-auto mix-blend-multiply`} />
    )
  }

  return (
    <span className="font-display text-[1.75rem] leading-none font-medium tracking-[0.08em] text-teal md:text-[2rem]">
      {site.name}
    </span>
  )
}

/** Five thread-swatches in the logo colours — the site's one recurring ornament. */
export function Swatches({ className = '' }: { className?: string }) {
  return (
    <span className={`flex gap-1.5 ${className}`} aria-hidden="true">
      {['bg-teal', 'bg-maroon', 'bg-leaf', 'bg-mustard', 'bg-coral'].map((color) => (
        <span key={color} className={`h-1.5 w-6 ${color}`} />
      ))}
    </span>
  )
}
