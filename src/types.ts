export interface Product {
  id: string
  name: string
  category: string
  /** One line, used on cards. */
  shortDescription: string
  /** Full description, used in the product modal. */
  description: string
  material: string
  craftsmanship: string
  customizationAvailable: boolean
  image: string
  imageAlt: string
}

interface SlideBase {
  id: string
  /** Small label above the heading, e.g. the step in the story. */
  eyebrow?: string
  heading: string
  description?: string
  cta?: { label: string; to: string }
  alt: string
}

export interface ImageSlide extends SlideBase {
  type: 'image'
  src: string
}

export interface VideoSlide extends SlideBase {
  type: 'video'
  /** Leave empty to show only the poster. */
  src: string
  poster: string
}

export type Slide = ImageSlide | VideoSlide

export interface GalleryItem {
  id: string
  /** Image, or the poster frame when `video` is set. */
  src: string
  alt: string
  /** Optional short silent film shown in place of the image. */
  video?: string
}
