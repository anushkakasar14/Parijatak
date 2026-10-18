import { Link } from 'react-router-dom'
import { navLinks } from '../config/site'
import { useSite } from '../context/SiteContext'
import { whatsappMessages } from '../lib/whatsapp'
import { Logo, Swatches } from './Logo'
import { SocialLinks } from './SocialLinks'

export function Footer() {
  const { settings, whatsappUrl, whatsappDisplay } = useSite()
  const { brand, contact, footer } = settings
  // Padding makes each link about 44 px tall to tap, without changing how it looks.
  const linkClass = 'inline-block py-2.5 underline underline-offset-4 transition-colors hover:text-maroon'

  return (
    <footer className="border-t border-gold/40 bg-cream">
      <div className="container-page grid gap-12 py-16 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1.4fr] lg:gap-10 lg:py-20">
        <div>
          <Link to="/" aria-label={`${brand.name} — home`} className="inline-flex">
            <Logo className="h-28" />
          </Link>
          <p className="mt-5 max-w-xs font-display text-xl leading-snug italic">{brand.tagline}</p>
          <Swatches className="mt-6" />
        </div>

        <nav aria-label="Footer">
          <h2 className="eyebrow mb-5 font-sans">Quick Links</h2>
          <ul>
            {navLinks.map(({ label, to }) => (
              <li key={to}>
                <Link to={to} className="inline-flex min-h-11 items-center transition-colors hover:text-maroon">
                  {label === 'Contact Us' ? 'Contact' : label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h2 className="eyebrow mb-5 font-sans">Social</h2>
          <SocialLinks />
        </div>

        <div>
          <h2 className="eyebrow mb-5 font-sans">Studio</h2>
          <address className="not-italic">
            <span className="font-medium">{contact.addressName}</span>
            {contact.addressLines.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </address>
          <ul className="mt-3">
            <li>
              <span className="text-muted">WhatsApp: </span>
              <a
                href={whatsappUrl(whatsappMessages.general)}
                target="_blank"
                rel="noopener noreferrer"
                className={linkClass}
              >
                {whatsappDisplay}
              </a>
            </li>
            {contact.phone && (
              <li>
                <span className="text-muted">Phone: </span>
                <a href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`} className={linkClass}>
                  {contact.phone}
                </a>
              </li>
            )}
            {contact.email && (
              <li>
                <span className="text-muted">Email: </span>
                <a href={`mailto:${contact.email}`} className={`${linkClass} break-all`}>
                  {contact.email}
                </a>
              </li>
            )}
          </ul>
        </div>
      </div>

      <div className="border-t border-line">
        <p className="container-page py-6 text-sm text-muted">
          © {new Date().getFullYear()} {brand.name}. All rights reserved.
          {footer.note && <span className="block sm:ml-3 sm:inline">{footer.note}</span>}
        </p>
      </div>
    </footer>
  )
}
