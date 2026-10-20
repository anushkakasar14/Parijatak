import { z } from 'zod'
import { publicationStatuses } from '../models/productModel.ts'
import { sanitizeLine, sanitizeText } from './sanitize.ts'

// ── Building blocks ─────────────────────────────────────────────────────────────

/** Required single-line text. */
const line = (max: number, label: string) =>
  z
    .string(`${label} is required`)
    .transform(sanitizeLine)
    .pipe(z.string().min(1, `${label} is required`).max(max, `${label} is too long`))

/** Optional single-line text: empty becomes null, "not sent" stays undefined. */
const optionalLine = (max: number) =>
  z
    .string()
    .nullable()
    .optional()
    .transform((v) => (v == null ? v : sanitizeLine(v) || null))
    .pipe(z.string().max(max, 'Too long').nullable().optional())

/** Optional multi-line text. */
const optionalText = (max: number) =>
  z
    .string()
    .nullable()
    .optional()
    .transform((v) => (v == null ? v : sanitizeText(v) || null))
    .pipe(z.string().max(max, 'Too long').nullable().optional())

/**
 * Where an image, video or button may point: a path on this site ("/media/x.jpg",
 * "/collection") or a full https:// address. Anything else — including javascript:
 * and data: addresses — is rejected.
 */
const URL_PATTERN = /^(\/(?!\/)[^\s<>"']*|https:\/\/[^\s<>"']+)$/
const URL_MESSAGE = 'Use a path starting with / or a full https:// address'

const url = z.string().trim().max(500).regex(URL_PATTERN, URL_MESSAGE)
const optionalUrl = z
  .string()
  .nullable()
  .optional()
  .transform((v) => (v == null ? v : v.trim() || null))
  .pipe(z.string().max(500).regex(URL_PATTERN, URL_MESSAGE).nullable().optional())

const status = z.enum(publicationStatuses, 'Status must be draft, published or archived')
const displayOrder = z.coerce.number().int().min(0).max(100_000)
const money = z.coerce
  .number('Enter a price in numbers')
  .min(0, 'Price cannot be negative')
  .max(10_000_000, 'Price is too high')
  .nullable()
  .optional()

export const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)

const slug = z
  .string()
  .trim()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens only')
  .max(64)

export const idParam = z.object({ id: z.string().regex(/^[a-zA-Z0-9.-]{1,64}$/, 'Invalid id') })
export const uuidParam = z.object({ id: z.uuid('Invalid id') })

const pagination = {
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
}

// ── Products ────────────────────────────────────────────────────────────────────

/** Sizes a product is made in; a price is given only when it differs from the product's. */
const productSizes = z
  .array(
    z.strictObject({
      label: line(80, 'Size'),
      price: z
        .number('Enter a price in numbers')
        .min(0, 'Price cannot be negative')
        .max(10_000_000, 'Price is too high')
        .nullable()
        .default(null),
    }),
  )
  .max(20, 'Too many sizes')
  .superRefine((sizes, ctx) => {
    const seen = new Set<string>()
    sizes.forEach((size, index) => {
      const key = size.label.toLowerCase()
      if (seen.has(key)) {
        ctx.addIssue({ code: 'custom', path: [index, 'label'], message: 'This size is already listed' })
      }
      seen.add(key)
    })
  })

const productFields = {
  name: line(120, 'Name'),
  slug: slug.optional(),
  categoryId: z.string('Category is required').regex(/^[a-z0-9-]{1,64}$/, 'Choose a category'),
  shortDescription: optionalLine(200),
  description: z
    .string('Description is required')
    .transform(sanitizeText)
    .pipe(z.string().min(1, 'Description is required').max(5000, 'Description is too long')),
  material: optionalText(1000),
  craftsmanship: optionalText(1000),
  dimensions: optionalLine(300),
  variants: z.array(line(80, 'Variant')).max(30, 'Too many variants'),
  sizes: productSizes,
  price: money,
  offerPrice: money,
  imageUrl: url,
  imageAlt: optionalLine(200),
  additionalImages: z
    .array(z.object({ url, alt: z.string().transform(sanitizeLine).pipe(z.string().max(200)).default('') }))
    .max(12, 'Too many images'),
  customizationAvailable: z.boolean(),
  isFeatured: z.boolean(),
  displayOrder,
  status,
}

const offerPriceRule = (
  data: { price?: number | null; offerPrice?: number | null },
  ctx: z.RefinementCtx,
) => {
  if (data.price != null && data.offerPrice != null && data.offerPrice > data.price) {
    ctx.addIssue({
      code: 'custom',
      path: ['offerPrice'],
      message: 'Offer price cannot be higher than the price',
    })
  }
}

export const createProductSchema = z
  .strictObject({
    ...productFields,
    variants: productFields.variants.default([]),
    sizes: productFields.sizes.default([]),
    additionalImages: productFields.additionalImages.default([]),
    customizationAvailable: productFields.customizationAvailable.default(true),
    isFeatured: productFields.isFeatured.default(false),
    displayOrder: displayOrder.default(0),
    // New products start as drafts unless the administrator says otherwise.
    status: status.default('draft'),
  })
  .superRefine(offerPriceRule)

export const updateProductSchema = z.strictObject(productFields).partial().superRefine(offerPriceRule)

export const listAdminProductsSchema = z.object({
  status: status.optional(),
  sort: z.enum(['order', 'name', 'created', 'updated']).default('order'),
  direction: z.enum(['asc', 'desc']).optional(),
  categoryId: z
    .string()
    .regex(/^[a-z0-9-]{1,64}$/)
    .optional(),
  search: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => v || undefined),
  ...pagination,
})

// ── Categories ──────────────────────────────────────────────────────────────────

const categoryFields = {
  name: line(80, 'Name'),
  slug,
  description: optionalText(500),
  isActive: z.boolean(),
  displayOrder,
}

export const createCategorySchema = z.strictObject({
  ...categoryFields,
  slug: slug.optional(),
  isActive: z.boolean().default(true),
  displayOrder: displayOrder.default(0),
})

export const updateCategorySchema = z.strictObject(categoryFields).partial()

// ── Homepage slides ─────────────────────────────────────────────────────────────

const slideFields = {
  mediaType: z.enum(['image', 'video'], 'Choose image or video'),
  mediaUrl: url,
  posterUrl: optionalUrl,
  altText: z.string().transform(sanitizeLine).pipe(z.string().max(300, 'Too long')),
  eyebrow: optionalLine(80),
  heading: line(150, 'Heading'),
  description: optionalLine(300),
  ctaLabel: optionalLine(60),
  ctaUrl: optionalUrl,
  displayOrder,
  isActive: z.boolean(),
  status,
}

export const createSlideSchema = z.strictObject({
  ...slideFields,
  altText: slideFields.altText.default(''),
  displayOrder: displayOrder.default(0),
  isActive: z.boolean().default(true),
  status: status.default('draft'),
})

export const updateSlideSchema = z.strictObject(slideFields).partial()

// ── Page sections ───────────────────────────────────────────────────────────────

export const updateSectionSchema = z
  .strictObject({
    eyebrow: optionalLine(120),
    heading: line(200, 'Heading'),
    body: z.string().transform(sanitizeText).pipe(z.string().max(5000, 'Text is too long')),
    imageUrl: optionalUrl,
    imageAlt: optionalLine(200),
    ctaLabel: optionalLine(60),
    ctaUrl: optionalUrl,
  })
  .partial()

export const pageParam = z.object({ page: z.enum(['home', 'about', 'collection'], 'Unknown page') })

// ── Offers ──────────────────────────────────────────────────────────────────────

const dateTime = z
  .union([z.iso.datetime({ offset: true }), z.iso.date()], 'Use a valid date')
  .nullable()
  .optional()
  .transform((v) => (v == null ? v : new Date(v).toISOString()))

const offerFields = {
  title: line(150, 'Title'),
  description: optionalText(1000),
  discountText: optionalLine(80),
  bannerImageUrl: optionalUrl,
  bannerImageAlt: optionalLine(200),
  ctaLabel: optionalLine(60),
  ctaUrl: optionalUrl,
  startsAt: dateTime,
  endsAt: dateTime,
  status,
}

const offerDatesRule = (
  data: { startsAt?: string | null; endsAt?: string | null },
  ctx: z.RefinementCtx,
) => {
  if (data.startsAt && data.endsAt && data.endsAt <= data.startsAt) {
    ctx.addIssue({ code: 'custom', path: ['endsAt'], message: 'End must be after the start' })
  }
}

export const createOfferSchema = z
  .strictObject({ ...offerFields, status: status.default('draft') })
  .superRefine(offerDatesRule)

export const updateOfferSchema = z.strictObject(offerFields).partial().superRefine(offerDatesRule)

// ── Site settings: one schema per key ───────────────────────────────────────────

const optionalHttps = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === '' || /^https:\/\/[^\s<>"']+$/.test(v), 'Use a full https:// address, or leave empty')

export const settingSchemas = {
  brand: z.strictObject({
    name: line(80, 'Brand name'),
    tagline: z.string().transform(sanitizeLine).pipe(z.string().max(200)),
  }),
  contact: z.strictObject({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .max(254)
      .refine((v) => v === '' || z.email().safeParse(v).success, 'Enter a valid email, or leave empty'),
    phone: z.string().transform(sanitizeLine).pipe(z.string().max(30)),
    whatsappNumber: z
      .string()
      .trim()
      .regex(/^\d{10,15}$/, 'Digits only, with country code — e.g. 918080657140'),
    addressName: z.string().transform(sanitizeLine).pipe(z.string().max(120)),
    addressLines: z.array(line(120, 'Address line')).max(8),
  }),
  social: z.strictObject({
    instagram: optionalHttps,
    youtube: optionalHttps,
    facebook: optionalHttps,
  }),
  footer: z.strictObject({
    note: z.string().transform(sanitizeLine).pipe(z.string().max(300)),
  }),
  gallery: z.strictObject({
    items: z
      .array(
        z.strictObject({
          imageUrl: url,
          videoUrl: z
            .string()
            .trim()
            .max(500)
            .refine((v) => v === '' || URL_PATTERN.test(v), URL_MESSAGE),
          alt: z.string().transform(sanitizeLine).pipe(z.string().max(200)),
        }),
      )
      .max(12, 'Too many gallery items'),
  }),
} as const

export type SettingKey = keyof typeof settingSchemas
export const settingKeyParam = z.object({
  key: z.enum(Object.keys(settingSchemas) as [SettingKey, ...SettingKey[]], 'Unknown setting'),
})
/** Settings that visitors may see. (All of them, today — listed explicitly on purpose.) */
export const publicSettingKeys: SettingKey[] = ['brand', 'contact', 'social', 'footer', 'gallery']

// ── Product pictures ────────────────────────────────────────────────────────────

/** Most pictures a product can have: the main one and twelve more. */
export const MAX_PRODUCT_IMAGES = 13

const imageAlt = z.string().transform(sanitizeLine).pipe(z.string().max(200, 'Too long'))

export const productImageParams = z.object({
  id: z.string().regex(/^[a-zA-Z0-9.-]{1,64}$/, 'Invalid id'),
  imageId: z.uuid('Invalid picture id'),
})

export const addProductImageSchema = z.strictObject({
  url,
  altText: imageAlt.default(''),
  /** Make the new picture the one shown on the collection page. */
  makePrimary: z.boolean().default(false),
})

/** Change the description, or replace the picture (same place in the gallery), or both. */
export const updateProductImageSchema = z
  .strictObject({ url: url.optional(), altText: imageAlt.optional() })
  .refine((v) => v.url !== undefined || v.altText !== undefined, { message: 'Nothing to update', path: ['altText'] })

export const reorderProductImagesSchema = z.strictObject({
  imageIds: z
    .array(z.uuid('Invalid picture id'))
    .min(1, 'List the pictures in their new order')
    .max(MAX_PRODUCT_IMAGES)
    .refine((ids) => new Set(ids).size === ids.length, 'Each picture may appear only once'),
})
