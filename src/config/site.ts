/**
 * Single source of truth for brand details, contact numbers and social links.
 * Edit values here — nothing below is repeated elsewhere in the codebase.
 */

/** WhatsApp number in international format, digits only (used for wa.me links). */
export const WHATSAPP_NUMBER = '917385087502'

/** Human-readable form of WHATSAPP_NUMBER, shown in the footer. */
export const WHATSAPP_DISPLAY = '+91 73850 87502'

export const INSTAGRAM_URL = 'https://www.instagram.com/studio_parijatk/'
export const YOUTUBE_URL = 'https://youtube.com/@patijatkhometextilestudio'

/** Leave empty until the official Facebook page is supplied — the link stays hidden while empty. */
export const FACEBOOK_URL = ''

export const site = {
  name: 'Parijatak',
  tagline: 'Parijatak — where home feels comfort, authentic, and artful',
  title: 'Parijatak — Handcrafted Home Textiles',
  description:
    'Discover handcrafted home textiles rooted in Indian tradition and designed for contemporary living.',

  /**
   * Path to the supplied logo file, e.g. '/logo.png' (place the file in /public).
   * While empty, a plain text wordmark is shown in its place.
   */
  logoSrc: '/logo.png',

  address: {
    name: 'Parijatak Home Textile Studio',
    lines: ['Ratndeep 4th Floor', 'Front of Dena Bank', 'Ghee Bazar', 'Nandurbar', '425412'],
  },
} as const

export const navLinks = [
  { label: 'Home', to: '/' },
  { label: 'Collection', to: '/collection' },
  { label: 'About', to: '/about' },
  { label: 'Contact Us', to: '/contact' },
] as const
