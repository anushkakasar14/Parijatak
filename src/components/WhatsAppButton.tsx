import type { ReactNode } from 'react'
import { whatsappMessages, whatsappUrl } from '../lib/whatsapp'
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
