import { site } from '../config/site'
import { useSite } from '../context/SiteContext'

interface LogoProps {
  className?: string
}

/** Renders the supplied Parijatak logo file as-is. */
export function Logo({ className = 'h-[4.5rem] md:h-[5.75rem]' }: LogoProps) {
  const { settings } = useSite()
  // The supplied file has a white background; multiply lets the page colour show through it.
  return (
    <img
      src={site.logoSrc}
      alt={settings.brand.name}
      className={`${className} w-auto mix-blend-multiply`}
    />
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
