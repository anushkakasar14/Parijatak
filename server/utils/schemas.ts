import { z } from 'zod'
import { sanitizeLine, sanitizeText } from './sanitize.ts'

export const inquiryTypes = [
  'Product Enquiry',
  'Customization',
  'Personalized Styling',
  'Institutional / Hospitality',
  'Collaboration',
  'General Enquiry',
] as const

export const enquiryStatuses = ['new', 'contacted', 'converted', 'closed'] as const
export const enquirySources = ['website', 'whatsapp', 'other'] as const

/** Normalises an Indian mobile number to +91XXXXXXXXXX, or returns null if invalid. */
function normalizeIndianPhone(value: string): string | null {
  const digits = value.replace(/[\s\-()]/g, '').replace(/^(\+91|91|0)(?=\d{10}$)/, '')
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null
}

export const createEnquirySchema = z.object({
  name: z
    .string('Name is required')
    .transform(sanitizeLine)
    .pipe(z.string().min(1, 'Name is required').max(100, 'Name is too long')),
  email: z
    .string('Email is required')
    .transform((v) => v.trim().toLowerCase())
    .pipe(z.email('Enter a valid email address').max(254, 'Email is too long')),
  phone: z.string('Phone number is required').transform((value, ctx) => {
    const phone = normalizeIndianPhone(value)
    if (!phone) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid 10-digit Indian mobile number' })
      return z.NEVER
    }
    return phone
  }),
  inquiryType: z.enum(inquiryTypes, 'Choose a valid inquiry type'),
  message: z
    .string('Message is required')
    .transform(sanitizeText)
    .pipe(z.string().min(1, 'Message is required').max(2000, 'Message is too long')),
  productId: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{1,64}$/, 'Invalid product')
    .nullish()
    .transform((v) => v || null),
})

export type CreateEnquiryInput = z.infer<typeof createEnquirySchema>

export const updateEnquirySchema = z.strictObject({
  status: z.enum(enquiryStatuses, `Status must be one of: ${enquiryStatuses.join(', ')}`),
})

export const listEnquiriesSchema = z.object({
  status: z.enum(enquiryStatuses).optional(),
  inquiryType: z.enum(inquiryTypes).optional(),
  source: z.enum(enquirySources).optional(),
  productId: z
    .string()
    .trim()
    .regex(/^[a-z0-9-]{1,64}$/)
    .optional(),
  hasProduct: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  synced: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  search: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => v || undefined),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
})

export const listProductsSchema = z.object({
  featured: z.enum(['true', 'false']).optional(),
  category: z.string().trim().max(64).optional(),
})
