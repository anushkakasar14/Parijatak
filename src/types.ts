import type { GalleryItem, SectionContent, SlideContent } from '../shared/defaultContent'
import type { ProductSize } from '../shared/productPricing'

export type { GalleryItem, SectionContent, SiteSettings } from '../shared/defaultContent'

/** A published product, as returned by GET /api/products. */
export interface Product {
  id: string
  name: string
  slug: string
  category: string
  categoryId: string | null
  shortDescription: string | null
  description: string
  material: string | null
  craftsmanship: string | null
  dimensions: string | null
  variants: string[]
  /** Sizes the product is made in; a size's price is set only when it differs. */
  sizes: ProductSize[]
  price: number | null
  offerPrice: number | null
  imageUrl: string
  imageAlt: string | null
  /** Main image first, then any extra ones. */
  images: { url: string; alt: string }[]
  customizationAvailable: boolean
  isFeatured: boolean
}

export interface Category {
  id: string
  name: string
  productCount: number
}

export interface Slide extends SlideContent {
  id: string
}

export interface Offer {
  id: string
  title: string
  description: string | null
  discountText: string | null
  bannerImageUrl: string | null
  bannerImageAlt: string | null
  ctaLabel: string | null
  ctaUrl: string | null
}

export interface HomepageData {
  slides: Slide[]
  offers: Offer[]
  gallery: GalleryItem[]
}

export interface PageData {
  sections: Record<string, SectionContent>
}
