export const enquiryStatuses = ['new', 'contacted', 'follow_up', 'converted', 'closed'] as const
export type EnquiryStatus = (typeof enquiryStatuses)[number]

export const enquiryStatusLabels: Record<EnquiryStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  follow_up: 'Follow-up required',
  converted: 'Converted',
  closed: 'Closed',
}

export const inquiryTypes = [
  'Product Enquiry',
  'Customization',
  'Personalized Styling',
  'Institutional / Hospitality',
  'Collaboration',
  'General Enquiry',
] as const

export interface Enquiry {
  id: string
  name: string
  email: string
  phone: string
  inquiryType: string
  message: string
  productId: string | null
  productName: string | null
  source: string
  status: EnquiryStatus
  createdAt: string
  updatedAt: string
  sheetSyncedAt: string | null
  /** Why the last attempt to copy it to Google Sheets failed, if it did. */
  sheetSyncError: string | null
  internalNotes: string | null
}

export interface Paginated<T> {
  data: T[]
  pagination: { total: number; limit: number; offset: number }
}

export interface Overview {
  range: { from: string | null; to: string | null }
  enquiries: {
    total: number
    byStatus: Record<EnquiryStatus, number>
    last7Days: number
    productEnquiries: number
    unsynced: number
  }
  products: { total: number; active: number; published: number; draft: number; archived: number }
  offers: { active: number; scheduled: number }
  googleSheets: {
    configured: boolean
    mode: 'apps-script' | 'service-account' | null
    pending: number
    /** The formula feed the sheet reads; lastSuccessAt is when Google last actually read it. */
    feed: { enabled: boolean; lastSuccessAt: string | null; detail: string | null }
  }
  recentEnquiries: Enquiry[]
  recentProducts: {
    id: string
    name: string
    status: PublicationStatus
    imageUrl: string
    updatedAt: string
    category: string
  }[]
}

export interface ProductImage {
  url: string
  alt: string
}

export interface AdminProduct {
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
  price: number | null
  offerPrice: number | null
  imageUrl: string
  imageAlt: string | null
  images: ProductImage[]
  customizationAvailable: boolean
  isFeatured: boolean
  displayOrder: number
  status: PublicationStatus
  createdAt: string
  updatedAt: string
}

export interface Category {
  id: string
  name: string
  description: string | null
  isActive: boolean
  displayOrder: number
  productCount: number
  publishedCount: number
}

export interface MediaAsset {
  id: string
  url: string
  filename: string
  contentType: string
  byteSize: number
  width: number | null
  height: number | null
  altText: string
  createdAt: string
}

export type PublicationStatus = 'draft' | 'published' | 'archived'

export const statusOptions: { value: PublicationStatus; label: string }[] = [
  { value: 'published', label: 'Published — shown on the website' },
  { value: 'draft', label: 'Draft — hidden' },
  { value: 'archived', label: 'Archived — hidden' },
]

export interface Slide {
  id: string
  mediaType: 'image' | 'video'
  mediaUrl: string
  posterUrl: string | null
  altText: string
  eyebrow: string | null
  heading: string
  description: string | null
  ctaLabel: string | null
  ctaUrl: string | null
  displayOrder: number
  isActive: boolean
  status: PublicationStatus
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
  startsAt: string | null
  endsAt: string | null
  status: PublicationStatus
}

export interface PageSection {
  id: string
  page: string
  label: string
  eyebrow: string | null
  heading: string
  body: string
  imageUrl: string | null
  imageAlt: string | null
  ctaLabel: string | null
  ctaUrl: string | null
  displayOrder: number
}

export interface SiteSettings {
  brand: { name: string; tagline: string }
  contact: {
    email: string
    phone: string
    whatsappNumber: string
    addressName: string
    addressLines: string[]
  }
  social: { instagram: string; youtube: string; facebook: string }
  footer: { note: string }
  gallery: { items: { imageUrl: string; videoUrl: string; alt: string }[] }
}
