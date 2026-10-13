export const enquiryStatuses = ['new', 'contacted', 'converted', 'closed'] as const
export type EnquiryStatus = (typeof enquiryStatuses)[number]

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
}

export interface Paginated<T> {
  data: T[]
  pagination: { total: number; limit: number; offset: number }
}

export interface Overview {
  enquiries: {
    total: number
    byStatus: Record<EnquiryStatus, number>
    last7Days: number
    productEnquiries: number
    unsynced: number
  }
  products: { total: number; active: number }
  googleSheets: { configured: boolean; pending: number }
  recentEnquiries: Enquiry[]
}

export interface AdminProduct {
  id: string
  name: string
  category: string
  description: string
  imageUrl: string
  isFeatured: boolean
  customizationAvailable: boolean
}
