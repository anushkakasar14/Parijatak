/**
 * Search-engine titles and descriptions for the public pages, in one place. The pages use
 * them while running, and the build writes them into each page's own HTML file (and the
 * sitemap), so search engines and link previews see them without running any JavaScript.
 *
 * Only facts the website itself states belong here.
 */
export const SITE_URL = 'https://www.studioparijatak.com'

export interface PageSeo {
  path: string
  /** The built HTML file that serves this address. */
  file: string
  title: string
  description: string
}

export const pageSeo = {
  home: {
    path: '/',
    file: 'index.html',
    title: 'Parijatak — Handcrafted Ghongadi & Wool Home Textiles',
    description:
      'Parijatak Home Textile Studio, Nandurbar: handspun, handwoven pure wool Ghongadi sofa spreads and throws, rooted in Maharashtrian tradition and made for today’s homes.',
  },
  collection: {
    path: '/collection',
    file: 'collection.html',
    title: 'Wool Sofa Spreads, Throws & Custom Designs — Parijatak',
    description:
      'Browse 100% pure wool sofa spreads and throws, handspun and handwoven, or choose a design to be custom-made in your size. Enquire on WhatsApp.',
  },
  about: {
    path: '/about',
    file: 'about.html',
    title: 'About Parijatak — Ghongadi Craft for Contemporary Homes',
    description:
      'The story of Parijatak Home Textile Studio and its founder: traditional Maharashtrian Ghongadi woollen craft, made by hand for contemporary living.',
  },
  contact: {
    path: '/contact',
    file: 'contact.html',
    title: 'Contact Parijatak — Enquiries & Custom Orders',
    description:
      'Enquire about Parijatak wool textiles, custom sizes, styling and collaborations. Studio in Ghee Bazar, Nandurbar, Maharashtra.',
  },
} satisfies Record<string, PageSeo>

export const notFoundSeo = { title: 'Page not found — Parijatak', description: pageSeo.home.description }
