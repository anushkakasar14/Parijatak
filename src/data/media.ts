import type { GalleryItem, Slide } from '../types'

/**
 * Hero carousel — the making of a Parijatak textile, told in five steps:
 * source → yarn → loom → studio → home. Files live in /public/media.
 */
export const heroSlides: Slide[] = [
  {
    id: 'story-source',
    type: 'video',
    src: '/media/story-source.mp4',
    poster: '/media/story-source-poster.jpg',
    alt: 'A flock of sheep and goats walking along a dusty road at dusk',
    eyebrow: '01 — The Source',
    heading: 'Crafted for the way you live',
    description: 'Every Parijatak textile begins long before the loom — at the source.',
    cta: { label: 'Our Story', to: '/about' },
  },
  {
    id: 'story-yarn',
    type: 'video',
    src: '/media/story-yarn.mp4',
    poster: '/media/story-yarn-poster.jpg',
    alt: 'Hanks of natural and dark yarn hanging to dry on a wall',
    eyebrow: '02 — The Yarn',
    heading: 'From fibre to yarn',
    description: 'Natural fibre is prepared and spun, hank by hank.',
    cta: { label: 'Our Story', to: '/about' },
  },
  {
    id: 'story-loom',
    type: 'image',
    src: '/media/story-loom.jpg',
    alt: 'A traditional floor loom strung with dark yarn in a weaver’s workshop',
    eyebrow: '03 — The Loom',
    heading: 'Woven by hand',
    description: 'On a traditional loom, thread by thread, the cloth takes shape.',
    cta: { label: 'Our Story', to: '/about' },
  },
  {
    id: 'story-studio',
    type: 'image',
    src: '/media/story-sample.jpg',
    alt: 'A hand holding a small pink and natural woven sample in front of a studio pinboard of sketches',
    eyebrow: '04 — The Studio',
    heading: 'Designed with care',
    description: 'Each pattern is sketched, sampled and refined in our studio.',
    cta: { label: 'Our Story', to: '/about' },
  },
  {
    id: 'story-home',
    type: 'image',
    src: '/media/story-throw.jpg',
    alt: 'A finished natural-toned textile with coloured stitching and orange star motifs, laid on grass in dappled light',
    eyebrow: '05 — The Home',
    heading: 'Made for your home',
    description: 'Handcrafted textiles, ready to be lived with every day.',
    cta: { label: 'Explore Collection', to: '/collection' },
  },
]

/** "From the studio" section. */
export const galleryItems: GalleryItem[] = [
  {
    id: 'studio-film',
    src: '/media/studio-film-poster.jpg',
    video: '/media/studio-film.mp4',
    alt: 'Time-lapse of a designer at work at the Parijatak studio desk',
  },
  {
    id: 'studio-2',
    src: '/media/studio-2.jpg',
    alt: 'A woman holding up a fringed natural-fibre textile inside a workshop',
  },
  {
    id: 'studio-3',
    src: '/media/studio-3.jpg',
    alt: 'A small woven sample in dark and natural stripes with a fringed edge',
  },
]
