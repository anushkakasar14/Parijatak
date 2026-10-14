import { useSite } from '../context/SiteContext'
import { whatsappMessages } from '../lib/whatsapp'
import { FacebookIcon, InstagramIcon, WhatsAppIcon, YouTubeIcon } from './Icons'

interface SocialLinksProps {
  /** `list` — stacked text links (footer). `buttons` — outlined buttons (about). */
  variant?: 'list' | 'buttons'
  className?: string
}

export function SocialLinks({ variant = 'list', className = '' }: SocialLinksProps) {
  const { settings, whatsappUrl } = useSite()
  const isButtons = variant === 'buttons'

  // A link with no address set in the admin settings is simply left out.
  const links = [
    { label: 'Instagram', href: settings.social.instagram, icon: <InstagramIcon /> },
    { label: 'YouTube', href: settings.social.youtube, icon: <YouTubeIcon /> },
    { label: 'WhatsApp', href: whatsappUrl(whatsappMessages.general), icon: <WhatsAppIcon /> },
    { label: 'Facebook', href: settings.social.facebook, icon: <FacebookIcon /> },
  ].filter((link) => link.href)

  return (
    <ul className={`${isButtons ? 'flex flex-wrap gap-3' : 'space-y-2.5'} ${className}`}>
      {links.map(({ label, href, icon }) => (
        <li key={label}>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={
              isButtons
                ? 'btn btn-outline'
                : 'inline-flex items-center gap-2.5 transition-colors hover:text-maroon'
            }
          >
            {icon}
            {label}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </li>
      ))}
    </ul>
  )
}
