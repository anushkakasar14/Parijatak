import type { ReactElement } from 'react'
import { FACEBOOK_URL, INSTAGRAM_URL, YOUTUBE_URL } from '../config/site'
import { whatsappMessages, whatsappUrl } from '../lib/whatsapp'
import { FacebookIcon, InstagramIcon, WhatsAppIcon, YouTubeIcon } from './Icons'

interface SocialLink {
  label: string
  href: string
  icon: ReactElement
}

const socialLinks: SocialLink[] = [
  { label: 'Instagram', href: INSTAGRAM_URL, icon: <InstagramIcon /> },
  { label: 'YouTube', href: YOUTUBE_URL, icon: <YouTubeIcon /> },
  { label: 'WhatsApp', href: whatsappUrl(whatsappMessages.general), icon: <WhatsAppIcon /> },
  { label: 'Facebook', href: FACEBOOK_URL, icon: <FacebookIcon /> },
].filter((link) => link.href)

interface SocialLinksProps {
  /** `list` — stacked text links (footer). `buttons` — outlined buttons (contact, about). */
  variant?: 'list' | 'buttons'
  className?: string
}

export function SocialLinks({ variant = 'list', className = '' }: SocialLinksProps) {
  const isButtons = variant === 'buttons'

  return (
    <ul className={`${isButtons ? 'flex flex-wrap gap-3' : 'space-y-2.5'} ${className}`}>
      {socialLinks.map(({ label, href, icon }) => (
        <li key={label}>
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={
              isButtons
                ? 'btn btn-outline'
                : 'inline-flex items-center gap-2.5 transition-colors hover:text-teal'
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
