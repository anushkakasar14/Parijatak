import { randomUUID } from 'node:crypto'
import type { Queryable } from './database.ts'

/**
 * Starting content for the website, taken from what the pages showed before they were
 * database-driven. It is written once, by migration 3. After that the database is the
 * source of truth: nothing here is re-applied, so edits and deletions made later stick.
 */

const categories = [
  { id: 'bed-linens', name: 'Bed Linens', order: 1 },
  { id: 'cushion-covers', name: 'Cushion Covers', order: 2 },
  { id: 'throws', name: 'Throws', order: 3 },
]

const products = [
  {
    id: 'bed-linens',
    name: 'Bed Linens',
    shortDescription: 'Handcrafted bedding that brings quiet warmth to the room you rest in.',
    description:
      'Bed linens rooted in Indian traditional craftsmanship and designed for the way contemporary homes are lived in — comfortable, considered and made to be used every day.',
    imageUrl: '/media/shoot-bench.jpg',
    imageAlt: 'A black and natural checked Parijatak textile draped over a wooden garden bench',
    order: 1,
  },
  {
    id: 'cushion-covers',
    name: 'Cushion Covers',
    shortDescription: 'Artful accents that bring colour, texture and character to a seat or a corner.',
    description:
      'Cushion covers that carry the expressiveness of Indian craft into living spaces — an easy way to layer warmth and personality into a home.',
    imageUrl: '/media/shoot-ground.jpg',
    imageAlt: 'A fringed Parijatak textile with blue motifs in yellow and green diamonds, laid on the ground',
    order: 2,
  },
  {
    id: 'throws',
    name: 'Throws',
    shortDescription: 'A handcrafted layer of comfort for the sofa, the bed or a favourite chair.',
    description:
      'Throws made to be reached for — handcrafted textiles that add comfort and a sense of craft wherever they are draped.',
    imageUrl: '/media/shoot-motif.jpg',
    imageAlt: 'A fringed natural-toned Parijatak throw with a column of blue motifs in diamonds, hanging from a tree',
    order: 3,
  },
]

const slides = [
  {
    type: 'video',
    url: '/media/story-source.mp4',
    poster: '/media/story-source-poster.jpg',
    alt: 'A flock of sheep and goats walking along a dusty road at dusk',
    eyebrow: '01 — The Source',
    heading: 'Crafted for the way you live',
    description: 'Every Parijatak textile begins long before the loom — at the source.',
    cta: ['Our Story', '/about'],
  },
  {
    type: 'video',
    url: '/media/story-yarn.mp4',
    poster: '/media/story-yarn-poster.jpg',
    alt: 'Hanks of natural and dark yarn hanging to dry on a wall',
    eyebrow: '02 — The Yarn',
    heading: 'From fibre to yarn',
    description: 'Natural fibre is prepared and spun, hank by hank.',
    cta: ['Our Story', '/about'],
  },
  {
    type: 'image',
    url: '/media/story-loom.jpg',
    poster: null,
    alt: 'A traditional floor loom strung with dark yarn in a weaver’s workshop',
    eyebrow: '03 — The Loom',
    heading: 'Woven by hand',
    description: 'On a traditional loom, thread by thread, the cloth takes shape.',
    cta: ['Our Story', '/about'],
  },
  {
    type: 'image',
    url: '/media/story-sample.jpg',
    poster: null,
    alt: 'A hand holding a small pink and natural woven sample in front of a studio pinboard of sketches',
    eyebrow: '04 — The Studio',
    heading: 'Designed with care',
    description: 'Each pattern is sketched, sampled and refined in our studio.',
    cta: ['Our Story', '/about'],
  },
  {
    type: 'image',
    url: '/media/story-throw.jpg',
    poster: null,
    alt: 'A finished natural-toned textile with coloured stitching and orange star motifs, laid on grass in dappled light',
    eyebrow: '05 — The Home',
    heading: 'Made for your home',
    description: 'Handcrafted textiles, ready to be lived with every day.',
    cta: ['Explore Collection', '/collection'],
  },
]

const settings: Record<string, unknown> = {
  brand: {
    name: 'Parijatak',
    tagline: 'Parijatak — where home feels comfort, authentic, and artful',
  },
  contact: {
    email: '',
    phone: '',
    whatsappNumber: '917385087502',
    addressName: 'Parijatak Home Textile Studio',
    addressLines: ['Ratndeep 4th Floor', 'Front of Dena Bank', 'Ghee Bazar', 'Nandurbar', '425412'],
  },
  social: {
    instagram: 'https://www.instagram.com/studio_parijatk/',
    youtube: 'https://youtube.com/@patijatkhometextilestudio',
    facebook: '',
  },
  footer: { note: '' },
  gallery: {
    items: [
      {
        imageUrl: '/media/studio-film-poster.jpg',
        videoUrl: '/media/studio-film.mp4',
        alt: 'Time-lapse of a designer at work at the Parijatak studio desk',
      },
      {
        imageUrl: '/media/studio-2.jpg',
        videoUrl: '',
        alt: 'A woman holding up a fringed natural-fibre textile inside a workshop',
      },
      {
        imageUrl: '/media/studio-3.jpg',
        videoUrl: '',
        alt: 'A small woven sample in dark and natural stripes with a fringed edge',
      },
    ],
  },
}

interface SectionSeed {
  id: string
  label: string
  eyebrow?: string
  heading: string
  body?: string
  image?: [url: string, alt: string]
  cta?: [label: string, url: string]
}

/** Paragraphs are separated by a blank line. */
const sections: SectionSeed[] = [
  {
    id: 'home.intro',
    label: 'Homepage — introduction',
    eyebrow: 'Parijatak Home Textile Studio',
    heading: 'Where tradition finds its place at home.',
    body: 'Parijatak is a handcrafted home textile brand rooted in Indian traditional craftsmanship and made for the way we live now. We bring authentic textiles and thoughtful design together, so that the things you live with every day feel warm, comfortable and quietly artful.',
    cta: ['Discover Parijatak', '/about'],
  },
  {
    id: 'home.featured',
    label: 'Homepage — featured collection heading',
    eyebrow: 'Featured Collection',
    heading: 'Textiles to live with.',
    cta: ['View the Collection', '/collection'],
  },
  {
    id: 'home.craft',
    label: 'Homepage — our craft',
    eyebrow: 'Our Craft',
    heading: 'Craft that carries a story.',
    body: 'Every Parijatak textile begins with the hand. We work to preserve Indian craft — its skill, its patience, its character — while making it relevant to contemporary homes.\n\nThe result is design that feels timeless rather than nostalgic: tradition you can live with, every day.',
    image: ['/media/craft-swatch.jpg', 'A small hand-woven sample in pink and natural yarn, lying on a worktable'],
    cta: ['Our Story', '/about'],
  },
  {
    id: 'home.custom',
    label: 'Homepage — personalized textiles',
    eyebrow: 'Personalized Textiles',
    heading: 'Made for your space.',
    body: 'Have a particular size, colour or idea in mind? Tell us about your home and what you are looking for — we welcome enquiries for personalized and custom textile requirements.',
    cta: ['Talk to Us on WhatsApp', ''],
  },
  {
    id: 'home.studio',
    label: 'Homepage — from the studio heading',
    eyebrow: '@studio_parijatk',
    heading: 'From the studio',
    cta: ['Follow Parijatak on Instagram', ''],
  },
  {
    id: 'collection.intro',
    label: 'Collection — introduction',
    eyebrow: 'Parijatak',
    heading: 'The Collection',
    body: 'Thoughtfully crafted textiles for spaces that feel like home.',
  },
  {
    id: 'collection.contact',
    label: 'Collection — enquiry prompt',
    heading: 'Looking for something particular?',
    body: 'We take enquiries and orders personally over WhatsApp.',
    cta: ['Talk to Us on WhatsApp', ''],
  },
  {
    id: 'about.intro',
    label: 'About — introduction',
    heading: 'Where home feels comfort, authentic, and artful.',
    body: 'Parijatak is a handcrafted home textile brand rooted in Indian traditional craftsmanship and open to the way we live today. We make textiles for the home that carry warmth, comfort and artistic expression — premium in quality, approachable in spirit.',
  },
  {
    id: 'about.philosophy',
    label: 'About — our philosophy',
    eyebrow: '01 — Our Philosophy',
    heading: 'Timeless, not nostalgic.',
    body: 'We believe a home should feel honest. That means textiles that are authentic in how they are made, simple in how they are designed, and comfortable in how they are lived with.\n\nOur work sits where tradition and contemporary simplicity meet: timeless design that respects where it comes from and belongs in the homes of today.',
    image: ['/media/shoot-checks.jpg', 'A black and natural checked Parijatak throw hanging from a tree branch in a garden'],
  },
  {
    id: 'about.craft',
    label: 'About — craft and artisans',
    eyebrow: '02 — Craft & Artisans',
    heading: 'Made by hand, with care.',
    body: 'Human craftsmanship is at the heart of Parijatak. We work to preserve Indian craft by giving it a living place in everyday homes — valuing the skill, time and individuality that only the hand can bring.',
  },
  {
    id: 'about.living',
    label: 'About — contemporary living',
    eyebrow: '03 — Contemporary Living',
    heading: 'Designed for today.',
    body: 'Tradition matters most when it is used. Our bed linens, cushion covers and throws are designed with contemporary simplicity, so that craft sits naturally in modern spaces and in the rhythm of daily life.',
    image: ['/media/shoot-bench.jpg', 'A checked Parijatak throw draped over a wooden garden bench in evening light'],
  },
  {
    id: 'about.custom',
    label: 'About — personalized design',
    eyebrow: '04 — Personalized Design',
    heading: 'Made for your space.',
    body: 'Every home is different. We welcome enquiries for personalized and custom textile requirements — share your space and your ideas, and we will take it from there.',
    cta: ['Talk to Us on WhatsApp', ''],
  },
  {
    id: 'about.founder',
    label: 'About — founder',
    eyebrow: '05 — Founder',
    heading: 'The person behind Parijatak.',
    // Left empty on purpose: the founder's name and note have not been supplied yet.
    body: '',
    image: ['/media/about-founder.jpg', 'The founder of Parijatak standing in front of a carved wooden door, surrounded by plants'],
  },
  {
    id: 'about.social',
    label: 'About — follow along',
    eyebrow: '06 — Follow Along',
    heading: 'See the studio at work.',
  },
  {
    id: 'about.contact',
    label: 'About — contact prompt',
    heading: 'Let’s make your home feel like you.',
    body: 'Questions, custom requirements or collaborations — we would love to hear from you.',
    cta: ['Contact Us', '/contact'],
  },
]

export async function seedContent(tx: Queryable): Promise<void> {
  for (const c of categories) {
    await tx.query(
      `INSERT INTO categories (id, name, display_order) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [c.id, c.name, c.order],
    )
  }

  // New databases get the three launch products. Where a product already exists, only
  // its new, still-empty fields are filled in — existing values are left alone.
  for (const p of products) {
    await tx.query(
      `INSERT INTO products
         (id, name, slug, category, category_id, short_description, description,
          image_url, image_alt, display_order, is_featured, is_active, status)
       VALUES ($1, $2, $1, $2, $1, $3, $4, $5, $6, $7, TRUE, TRUE, 'published')
       ON CONFLICT (id) DO UPDATE SET
         short_description = COALESCE(products.short_description, EXCLUDED.short_description),
         image_alt         = COALESCE(products.image_alt, EXCLUDED.image_alt),
         category_id       = COALESCE(products.category_id, EXCLUDED.category_id),
         display_order     = CASE WHEN products.display_order = 0
                                  THEN EXCLUDED.display_order ELSE products.display_order END`,
      [p.id, p.name, p.shortDescription, p.description, p.imageUrl, p.imageAlt, p.order],
    )
  }

  for (const [index, s] of slides.entries()) {
    await tx.query(
      `INSERT INTO homepage_slides
         (id, media_type, media_url, poster_url, alt_text, eyebrow, heading, description,
          cta_label, cta_url, display_order, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'published')`,
      [randomUUID(), s.type, s.url, s.poster, s.alt, s.eyebrow, s.heading, s.description, s.cta[0], s.cta[1], index + 1],
    )
  }

  for (const [key, value] of Object.entries(settings)) {
    await tx.query(
      `INSERT INTO site_settings (key, value) VALUES ($1, $2::jsonb) ON CONFLICT DO NOTHING`,
      [key, JSON.stringify(value)],
    )
  }

  for (const [index, s] of sections.entries()) {
    await tx.query(
      `INSERT INTO page_sections
         (id, page, label, eyebrow, heading, body, image_url, image_alt, cta_label, cta_url, display_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT DO NOTHING`,
      [
        s.id,
        s.id.split('.')[0],
        s.label,
        s.eyebrow ?? null,
        s.heading,
        s.body ?? '',
        s.image?.[0] ?? null,
        s.image?.[1] ?? null,
        s.cta?.[0] ?? null,
        s.cta?.[1] || null,
        index + 1,
      ],
    )
  }
}
