import { Link } from 'react-router-dom'
import { WHATSAPP_DISPLAY, navLinks, site } from '../config/site'
import { whatsappMessages, whatsappUrl } from '../lib/whatsapp'
import { Logo, Swatches } from './Logo'
import { SocialLinks } from './SocialLinks'

export function Footer() {
  return (
    <footer className="border-t border-line bg-cream">
      <div className="container-page grid gap-12 py-16 sm:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr_1.4fr] lg:gap-10 lg:py-20">
        <div>
          <Link to="/" aria-label="Parijatak — home" className="inline-flex">
            <Logo className="h-28" />
          </Link>
          <p className="mt-5 max-w-xs font-display text-xl leading-snug italic">{site.tagline}</p>
          <Swatches className="mt-6" />
        </div>

        <nav aria-label="Footer">
          <h2 className="eyebrow mb-5 font-sans">Quick Links</h2>
          <ul className="space-y-2.5">
            {navLinks.map(({ label, to }) => (
              <li key={to}>
                <Link to={to} className="transition-colors hover:text-teal">
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
            <span className="font-medium">{site.address.name}</span>
            {site.address.lines.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
          </address>
          <p className="mt-5">
            <span className="text-muted">WhatsApp: </span>
            <a
              href={whatsappUrl(whatsappMessages.general)}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 transition-colors hover:text-teal"
            >
              {WHATSAPP_DISPLAY}
            </a>
          </p>
        </div>
      </div>

      <div className="border-t border-line">
        <p className="container-page py-6 text-sm text-muted">
          © {new Date().getFullYear()} {site.name}. All rights reserved.
        </p>
      </div>
    </footer>
  )
}
