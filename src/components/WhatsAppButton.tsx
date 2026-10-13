import type { ReactNode } from 'react'
import { useSite } from '../context/SiteContext'
import { whatsappMessages } from '../lib/whatsapp'
import { WhatsAppIcon } from './Icons'

interface WhatsAppButtonProps {
  /** Pre-filled message. Defaults to a general greeting. */
  message?: string
  variant?: 'primary' | 'outline' | 'light'
  className?: string
  children: ReactNode
}

export function WhatsAppButton({
  message = whatsappMessages.general,
  variant = 'primary',
  className = '',
  children,
}: WhatsAppButtonProps) {
  const { whatsappUrl } = useSite()

  return (
    <a
      href={whatsappUrl(message)}
      target="_blank"
      rel="noopener noreferrer"
      className={`btn btn-${variant} ${className}`}
    >
      <WhatsAppIcon />
      {children}
      <span className="sr-only"> (opens WhatsApp)</span>
    </a>
  )
}
