/**
 * The website's starting content, shared by both halves of the project:
 *
 *  - the server writes it into a new database once (migration 3), and
 *  - the public site falls back to the text and contact details here if the API cannot
 *    be reached, so a database outage never leaves a blank page.
 *
 * After the first run the DATABASE is the source of truth. Editing this file does not
 * change a live site — use the admin panel for that.
 */

export interface SectionContent {
  eyebrow: string | null
  heading: string
  /** Plain text; paragraphs are separated by a blank line. */
  body: string
  imageUrl: string | null
  imageAlt: string | null
  ctaLabel: string | null
  ctaUrl: string | null
}

export interface SlideContent {
  mediaType: 'image' | 'video'
  mediaUrl: string
  posterUrl: string | null
  altText: string
  eyebrow: string | null
  heading: string
  description: string | null
  ctaLabel: string | null
  ctaUrl: string | null
}

export interface GalleryItem {
  imageUrl: string
  /** Optional short silent film shown in place of the image. */
  videoUrl: string
  alt: string
}

export interface SiteSettings {
  brand: { name: string; tagline: string }
  contact: {
    email: string
    phone: string
    /** Digits only, with country code. */
    whatsappNumber: string
    addressName: string
    addressLines: string[]
  }
  social: { instagram: string; youtube: string; facebook: string }
  footer: { note: string }
  gallery: { items: GalleryItem[] }
}

export const defaultSettings: SiteSettings = {
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

const section = (
  label: string,
  content: Partial<SectionContent> & { heading: string },
): SectionContent & { label: string } => ({
  label,
  eyebrow: null,
  body: '',
  imageUrl: null,
  imageAlt: null,
  ctaLabel: null,
  ctaUrl: null,
  ...content,
})

/** Keyed by section id; the part before the dot is the page it belongs to. */
export const defaultSections = {
  'home.intro': section('Homepage — introduction', {
    eyebrow: 'Parijatak Home Textile Studio',
    heading: 'Where tradition finds its place at home.',
    body: 'Parijatak is a handcrafted home textile brand rooted in Indian traditional craftsmanship and made for the way we live now. We bring authentic textiles and thoughtful design together, so that the things you live with every day feel warm, comfortable and quietly artful.',
    ctaLabel: 'Discover Parijatak',
    ctaUrl: '/about',
  }),
  'home.featured': section('Homepage — featured collection heading', {
    eyebrow: 'Featured Collection',
    heading: 'Textiles to live with.',
    ctaLabel: 'View the Collection',
    ctaUrl: '/collection',
  }),
  'home.craft': section('Homepage — our craft', {
    eyebrow: 'Our Craft',
    heading: 'Craft that carries a story.',
    body: 'Every Parijatak textile begins with the hand. We work to preserve Indian craft — its skill, its patience, its character — while making it relevant to contemporary homes.\n\nThe result is design that feels timeless rather than nostalgic: tradition you can live with, every day.',
    imageUrl: '/media/craft-swatch.jpg',
    imageAlt: 'A small hand-woven sample in pink and natural yarn, lying on a worktable',
    ctaLabel: 'Our Story',
    ctaUrl: '/about',
  }),
  'home.custom': section('Homepage — personalized textiles', {
    eyebrow: 'Personalized Textiles',
    heading: 'Made for your space.',
    body: 'Have a particular size, colour or idea in mind? Tell us about your home and what you are looking for — we welcome enquiries for personalized and custom textile requirements.',
    ctaLabel: 'Talk to Us on WhatsApp',
  }),
  'home.studio': section('Homepage — from the studio heading', {
    eyebrow: '@studio_parijatk',
    heading: 'From the studio',
    ctaLabel: 'Follow Parijatak on Instagram',
  }),
  'collection.intro': section('Collection — introduction', {
    eyebrow: 'Parijatak',
    heading: 'The Collection',
    body: 'Thoughtfully crafted textiles for spaces that feel like home.',
  }),
  'collection.contact': section('Collection — enquiry prompt', {
    heading: 'Looking for something particular?',
    body: 'We take enquiries and orders personally over WhatsApp.',
    ctaLabel: 'Talk to Us on WhatsApp',
  }),
  'about.intro': section('About — introduction', {
    heading: 'Where home feels comfort, authentic, and artful.',
    body: 'Parijatak is a handcrafted home textile brand rooted in Indian traditional craftsmanship and open to the way we live today. We make textiles for the home that carry warmth, comfort and artistic expression — premium in quality, approachable in spirit.',
  }),
  'about.philosophy': section('About — our philosophy', {
    eyebrow: '01 — Our Philosophy',
    heading: 'Timeless, not nostalgic.',
    body: 'We believe a home should feel honest. That means textiles that are authentic in how they are made, simple in how they are designed, and comfortable in how they are lived with.\n\nOur work sits where tradition and contemporary simplicity meet: timeless design that respects where it comes from and belongs in the homes of today.',
    imageUrl: '/media/shoot-checks.jpg',
    imageAlt: 'A black and natural checked Parijatak throw hanging from a tree branch in a garden',
  }),
  'about.craft': section('About — craft and artisans', {
    eyebrow: '02 — Craft & Artisans',
    heading: 'Made by hand, with care.',
    body: 'Human craftsmanship is at the heart of Parijatak. We work to preserve Indian craft by giving it a living place in everyday homes — valuing the skill, time and individuality that only the hand can bring.',
  }),
  'about.living': section('About — contemporary living', {
    eyebrow: '03 — Contemporary Living',
    heading: 'Designed for today.',
    body: 'Tradition matters most when it is used. Our bed linens, cushion covers and throws are designed with contemporary simplicity, so that craft sits naturally in modern spaces and in the rhythm of daily life.',
    imageUrl: '/media/shoot-bench.jpg',
    imageAlt: 'A checked Parijatak throw draped over a wooden garden bench in evening light',
  }),
  'about.custom': section('About — personalized design', {
    eyebrow: '04 — Personalized Design',
    heading: 'Made for your space.',
    body: 'Every home is different. We welcome enquiries for personalized and custom textile requirements — share your space and your ideas, and we will take it from there.',
    ctaLabel: 'Talk to Us on WhatsApp',
  }),
  // The founder's name and note have not been supplied yet, so the text is left empty.
  'about.founder': section('About — founder', {
    eyebrow: '05 — Founder',
    heading: 'The person behind Parijatak.',
    imageUrl: '/media/about-founder.jpg',
    imageAlt: 'The founder of Parijatak standing in front of a carved wooden door, surrounded by plants',
  }),
  'about.social': section('About — follow along', {
    eyebrow: '06 — Follow Along',
    heading: 'See the studio at work.',
  }),
  'about.contact': section('About — contact prompt', {
    heading: 'Let’s make your home feel like you.',
    body: 'Questions, custom requirements or collaborations — we would love to hear from you.',
    ctaLabel: 'Contact Us',
    ctaUrl: '/contact',
  }),
} satisfies Record<string, SectionContent & { label: string }>

export type SectionId = keyof typeof defaultSections

export const defaultSlides: SlideContent[] = [
  {
    mediaType: 'video',
    mediaUrl: '/media/story-source.mp4',
    posterUrl: '/media/story-source-poster.jpg',
    altText: 'A flock of sheep and goats walking along a dusty road at dusk',
    eyebrow: '01 — The Source',
    heading: 'Crafted for the way you live',
    description: 'Every Parijatak textile begins long before the loom — at the source.',
    ctaLabel: 'Our Story',
    ctaUrl: '/about',
  },
  {
    mediaType: 'video',
    mediaUrl: '/media/story-yarn.mp4',
    posterUrl: '/media/story-yarn-poster.jpg',
    altText: 'Hanks of natural and dark yarn hanging to dry on a wall',
    eyebrow: '02 — The Yarn',
    heading: 'From fibre to yarn',
    description: 'Natural fibre is prepared and spun, hank by hank.',
    ctaLabel: 'Our Story',
    ctaUrl: '/about',
  },
  {
    mediaType: 'image',
    mediaUrl: '/media/story-loom.jpg',
    posterUrl: null,
    altText: 'A traditional floor loom strung with dark yarn in a weaver’s workshop',
    eyebrow: '03 — The Loom',
    heading: 'Woven by hand',
    description: 'On a traditional loom, thread by thread, the cloth takes shape.',
    ctaLabel: 'Our Story',
    ctaUrl: '/about',
  },
  {
    mediaType: 'image',
    mediaUrl: '/media/story-sample.jpg',
    posterUrl: null,
    altText: 'A hand holding a small pink and natural woven sample in front of a studio pinboard of sketches',
    eyebrow: '04 — The Studio',
    heading: 'Designed with care',
    description: 'Each pattern is sketched, sampled and refined in our studio.',
    ctaLabel: 'Our Story',
    ctaUrl: '/about',
  },
  {
    mediaType: 'image',
    mediaUrl: '/media/story-throw.jpg',
    posterUrl: null,
    altText: 'A finished natural-toned textile with coloured stitching and orange star motifs, laid on grass in dappled light',
    eyebrow: '05 — The Home',
    heading: 'Made for your home',
    description: 'Handcrafted textiles, ready to be lived with every day.',
    ctaLabel: 'Explore Collection',
    ctaUrl: '/collection',
  },
]

export const defaultCategories = [
  { id: 'bed-linens', name: 'Bed Linens' },
  { id: 'cushion-covers', name: 'Cushion Covers' },
  { id: 'throws', name: 'Throws' },
]

/** The three launch products. Material and price are left for Parijatak to fill in. */
export const defaultProducts = [
  {
    id: 'bed-linens',
    name: 'Bed Linens',
    shortDescription: 'Handcrafted bedding that brings quiet warmth to the room you rest in.',
    description:
      'Bed linens rooted in Indian traditional craftsmanship and designed for the way contemporary homes are lived in — comfortable, considered and made to be used every day.',
    imageUrl: '/media/shoot-bench.jpg',
    imageAlt: 'A black and natural checked Parijatak textile draped over a wooden garden bench',
  },
  {
    id: 'cushion-covers',
    name: 'Cushion Covers',
    shortDescription: 'Artful accents that bring colour, texture and character to a seat or a corner.',
    description:
      'Cushion covers that carry the expressiveness of Indian craft into living spaces — an easy way to layer warmth and personality into a home.',
    imageUrl: '/media/shoot-ground.jpg',
    imageAlt: 'A fringed Parijatak textile with blue motifs in yellow and green diamonds, laid on the ground',
  },
  {
    id: 'throws',
    name: 'Throws',
    shortDescription: 'A handcrafted layer of comfort for the sofa, the bed or a favourite chair.',
    description:
      'Throws made to be reached for — handcrafted textiles that add comfort and a sense of craft wherever they are draped.',
    imageUrl: '/media/shoot-motif.jpg',
    imageAlt: 'A fringed natural-toned Parijatak throw with a column of blue motifs in diamonds, hanging from a tree',
  },
]
