/**
 * Things that are part of the site's build rather than its content: the logo file,
 * search-engine titles and the navigation. Brand, contact and social details live in
 * the database and are read through `useSite()`.
 */
import { pageSeo } from './seo'

export const site = {
  title: pageSeo.home.title,
  description: pageSeo.home.description,

  /** Path to the supplied logo file (in /public). */
  logoSrc: '/logo.png',
} as const

export const navLinks = [
  { label: 'Home', to: '/' },
  { label: 'Collection', to: '/collection' },
  { label: 'About', to: '/about' },
  { label: 'Contact Us', to: '/contact' },
] as const
