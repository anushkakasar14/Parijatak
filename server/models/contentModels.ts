import { randomUUID } from 'node:crypto'
import { getDb } from '../config/database.ts'
import { buildUpdate, toIso, toIsoOrNull, translateConstraintError } from '../utils/sql.ts'
import type { PublicationStatus } from './productModel.ts'

// ── Categories ──────────────────────────────────────────────────────────────────

export interface Category {
  /** Also the category's web address, e.g. "bed-linens" in /collection?category=bed-linens. */
  id: string
  name: string
  description: string | null
  isActive: boolean
  displayOrder: number
  /** Products in the category: published only (public list) or all (admin list). */
  productCount: number
  publishedCount: number
}

interface CategoryRow {
  id: string
  name: string
  description: string | null
  is_active: boolean
  display_order: number
  product_count: number
  published_count: number
}

const toCategory = (row: CategoryRow): Category => ({
  id: row.id,
  name: row.name,
  description: row.description,
  isActive: row.is_active,
  displayOrder: row.display_order,
  productCount: row.product_count,
  publishedCount: row.published_count,
})

export interface CategoryInput {
  id: string
  name: string
  description: string | null
  isActive: boolean
  displayOrder: number
}

const categoryMessages = {
  unique: 'Another category already uses this name or web address.',
  foreignKey: 'This category still has products. Move or delete them first.',
}

export const categoryModel = {
  /**
   * `publishedOnly`: what visitors see — switched-on categories that have at least one
   * published product. Otherwise every category, with counts, for administrators.
   */
  async list(options: { publishedOnly: boolean }): Promise<Category[]> {
    const db = await getDb()
    const { rows } = await db.query<CategoryRow>(
      `SELECT c.id, c.name, c.description, c.is_active, c.display_order,
              COUNT(p.id)${options.publishedOnly ? " FILTER (WHERE p.status = 'published')" : ''}::int AS product_count,
              COUNT(p.id) FILTER (WHERE p.status = 'published')::int AS published_count
         FROM categories c
         LEFT JOIN products p ON p.category_id = c.id
        ${options.publishedOnly ? 'WHERE c.is_active' : ''}
        GROUP BY c.id
        ${options.publishedOnly ? "HAVING COUNT(p.id) FILTER (WHERE p.status = 'published') > 0" : ''}
        ORDER BY c.display_order, c.name`,
    )
    return rows.map(toCategory)
  },

  async exists(id: string): Promise<boolean> {
    const db = await getDb()
    const { rows } = await db.query('SELECT 1 FROM categories WHERE id = $1', [id])
    return rows.length > 0
  },

  async create(input: CategoryInput): Promise<void> {
    const db = await getDb()
    try {
      await db.query(
        'INSERT INTO categories (id, name, description, is_active, display_order) VALUES ($1, $2, $3, $4, $5)',
        [input.id, input.name, input.description, input.isActive, input.displayOrder],
      )
    } catch (err) {
      translateConstraintError(err, categoryMessages)
    }
  },

  /** A new `id` changes the web address; products follow automatically (ON UPDATE CASCADE). */
  async update(id: string, patch: Partial<CategoryInput>): Promise<string | null> {
    const { assignments, params } = buildUpdate(patch, {
      id: 'id',
      name: 'name',
      description: 'description',
      isActive: 'is_active',
      displayOrder: 'display_order',
    })
    const db = await getDb()
    if (!assignments) return (await this.exists(id)) ? id : null
    try {
      const { rows } = await db.query<{ id: string }>(
        `UPDATE categories SET ${assignments}, updated_at = now() WHERE id = $${params.length + 1} RETURNING id`,
        [...params, id],
      )
      if (!rows.length) return null
      const newId = rows[0].id
      // Keep the legacy text column on products in step with the name.
      await db.query(
        'UPDATE products SET category = (SELECT name FROM categories WHERE id = $1) WHERE category_id = $1',
        [newId],
      )
      return newId
    } catch (err) {
      translateConstraintError(err, categoryMessages)
    }
  },

  async delete(id: string): Promise<boolean> {
    const db = await getDb()
    try {
      const { rows } = await db.query('DELETE FROM categories WHERE id = $1 RETURNING id', [id])
      return rows.length > 0
    } catch (err) {
      translateConstraintError(err, categoryMessages)
    }
  },
}

// ── Homepage slides ─────────────────────────────────────────────────────────────

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
  createdAt: string
  updatedAt: string
}

interface SlideRow {
  id: string
  media_type: 'image' | 'video'
  media_url: string
  poster_url: string | null
  alt_text: string
  eyebrow: string | null
  heading: string
  description: string | null
  cta_label: string | null
  cta_url: string | null
  display_order: number
  is_active: boolean
  status: PublicationStatus
  created_at: Date
  updated_at: Date
}

const toSlide = (row: SlideRow): Slide => ({
  id: row.id,
  mediaType: row.media_type,
  mediaUrl: row.media_url,
  posterUrl: row.poster_url,
  altText: row.alt_text,
  eyebrow: row.eyebrow,
  heading: row.heading,
  description: row.description,
  ctaLabel: row.cta_label,
  ctaUrl: row.cta_url,
  displayOrder: row.display_order,
  isActive: row.is_active,
  status: row.status,
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
})

export type SlideInput = Omit<Slide, 'id' | 'createdAt' | 'updatedAt'>

const slideColumns: Record<keyof SlideInput, string> = {
  mediaType: 'media_type',
  mediaUrl: 'media_url',
  posterUrl: 'poster_url',
  altText: 'alt_text',
  eyebrow: 'eyebrow',
  heading: 'heading',
  description: 'description',
  ctaLabel: 'cta_label',
  ctaUrl: 'cta_url',
  displayOrder: 'display_order',
  isActive: 'is_active',
  status: 'status',
}

export const slideModel = {
  /** What visitors see: published and switched on, in display order. */
  async listPublic(): Promise<Slide[]> {
    const db = await getDb()
    const { rows } = await db.query<SlideRow>(
      `SELECT * FROM homepage_slides
        WHERE status = 'published' AND is_active
        ORDER BY display_order, created_at`,
    )
    return rows.map(toSlide)
  },

  async listAll(): Promise<Slide[]> {
    const db = await getDb()
    const { rows } = await db.query<SlideRow>(
      'SELECT * FROM homepage_slides ORDER BY display_order, created_at',
    )
    return rows.map(toSlide)
  },

  async create(input: SlideInput): Promise<Slide> {
    const db = await getDb()
    const { rows } = await db.query<SlideRow>(
      `INSERT INTO homepage_slides
         (id, media_type, media_url, poster_url, alt_text, eyebrow, heading, description,
          cta_label, cta_url, display_order, is_active, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING *`,
      [
        randomUUID(),
        input.mediaType,
        input.mediaUrl,
        input.posterUrl,
        input.altText,
        input.eyebrow,
        input.heading,
        input.description,
        input.ctaLabel,
        input.ctaUrl,
        input.displayOrder,
        input.isActive,
        input.status,
      ],
    )
    return toSlide(rows[0])
  },

  async update(id: string, patch: Partial<SlideInput>): Promise<Slide | null> {
    const { assignments, params } = buildUpdate(patch, slideColumns)
    const db = await getDb()
    const { rows } = await db.query<SlideRow>(
      assignments
        ? `UPDATE homepage_slides SET ${assignments}, updated_at = now() WHERE id = $${params.length + 1} RETURNING *`
        : 'SELECT * FROM homepage_slides WHERE id = $1',
      [...params, id],
    )
    return rows[0] ? toSlide(rows[0]) : null
  },

  async delete(id: string): Promise<boolean> {
    const db = await getDb()
    const { rows } = await db.query('DELETE FROM homepage_slides WHERE id = $1 RETURNING id', [id])
    return rows.length > 0
  },
}

// ── Site settings ───────────────────────────────────────────────────────────────

export const settingsModel = {
  async all(): Promise<Record<string, unknown>> {
    const db = await getDb()
    const { rows } = await db.query<{ key: string; value: unknown }>(
      'SELECT key, value FROM site_settings',
    )
    return Object.fromEntries(rows.map((row) => [row.key, row.value]))
  },

  async get<T>(key: string): Promise<T | null> {
    const db = await getDb()
    const { rows } = await db.query<{ value: T }>('SELECT value FROM site_settings WHERE key = $1', [
      key,
    ])
    return rows[0]?.value ?? null
  },

  async set(key: string, value: unknown): Promise<void> {
    const db = await getDb()
    await db.query(
      `INSERT INTO site_settings (key, value) VALUES ($1, $2::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [key, JSON.stringify(value)],
    )
  },
}

// ── Page sections ───────────────────────────────────────────────────────────────

export interface PageSection {
  id: string
  page: string
  /** Plain-language name shown to administrators. */
  label: string
  eyebrow: string | null
  heading: string
  /** Plain text; paragraphs are separated by a blank line. */
  body: string
  imageUrl: string | null
  imageAlt: string | null
  ctaLabel: string | null
  ctaUrl: string | null
  displayOrder: number
  updatedAt: string
}

interface SectionRow {
  id: string
  page: string
  label: string
  eyebrow: string | null
  heading: string
  body: string
  image_url: string | null
  image_alt: string | null
  cta_label: string | null
  cta_url: string | null
  display_order: number
  updated_at: Date
}

const toSection = (row: SectionRow): PageSection => ({
  id: row.id,
  page: row.page,
  label: row.label,
  eyebrow: row.eyebrow,
  heading: row.heading,
  body: row.body,
  imageUrl: row.image_url,
  imageAlt: row.image_alt,
  ctaLabel: row.cta_label,
  ctaUrl: row.cta_url,
  displayOrder: row.display_order,
  updatedAt: toIso(row.updated_at),
})

export type SectionPatch = Partial<
  Pick<PageSection, 'eyebrow' | 'heading' | 'body' | 'imageUrl' | 'imageAlt' | 'ctaLabel' | 'ctaUrl'>
>

export const sectionModel = {
  async list(page?: string): Promise<PageSection[]> {
    const db = await getDb()
    const { rows } = await db.query<SectionRow>(
      `SELECT * FROM page_sections ${page ? 'WHERE page = $1' : ''} ORDER BY page, display_order`,
      page ? [page] : [],
    )
    return rows.map(toSection)
  },

  async update(id: string, patch: SectionPatch): Promise<PageSection | null> {
    const { assignments, params } = buildUpdate(patch, {
      eyebrow: 'eyebrow',
      heading: 'heading',
      body: 'body',
      imageUrl: 'image_url',
      imageAlt: 'image_alt',
      ctaLabel: 'cta_label',
      ctaUrl: 'cta_url',
    })
    const db = await getDb()
    const { rows } = await db.query<SectionRow>(
      assignments
        ? `UPDATE page_sections SET ${assignments}, updated_at = now() WHERE id = $${params.length + 1} RETURNING *`
        : 'SELECT * FROM page_sections WHERE id = $1',
      [...params, id],
    )
    return rows[0] ? toSection(rows[0]) : null
  },
}

// ── Offers ──────────────────────────────────────────────────────────────────────

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
  createdAt: string
  updatedAt: string
}

interface OfferRow {
  id: string
  title: string
  description: string | null
  discount_text: string | null
  banner_image_url: string | null
  banner_image_alt: string | null
  cta_label: string | null
  cta_url: string | null
  starts_at: Date | null
  ends_at: Date | null
  status: PublicationStatus
  created_at: Date
  updated_at: Date
}

const toOffer = (row: OfferRow): Offer => ({
  id: row.id,
  title: row.title,
  description: row.description,
  discountText: row.discount_text,
  bannerImageUrl: row.banner_image_url,
  bannerImageAlt: row.banner_image_alt,
  ctaLabel: row.cta_label,
  ctaUrl: row.cta_url,
  startsAt: toIsoOrNull(row.starts_at),
  endsAt: toIsoOrNull(row.ends_at),
  status: row.status,
  createdAt: toIso(row.created_at),
  updatedAt: toIso(row.updated_at),
})

export type OfferInput = Omit<Offer, 'id' | 'createdAt' | 'updatedAt'>

const offerColumns: Record<keyof OfferInput, string> = {
  title: 'title',
  description: 'description',
  discountText: 'discount_text',
  bannerImageUrl: 'banner_image_url',
  bannerImageAlt: 'banner_image_alt',
  ctaLabel: 'cta_label',
  ctaUrl: 'cta_url',
  startsAt: 'starts_at',
  endsAt: 'ends_at',
  status: 'status',
}

export const offerModel = {
  /** Published offers whose date window includes right now. */
  async listActive(): Promise<Offer[]> {
    const db = await getDb()
    const { rows } = await db.query<OfferRow>(
      `SELECT * FROM offers
        WHERE status = 'published'
          AND (starts_at IS NULL OR starts_at <= now())
          AND (ends_at IS NULL OR ends_at > now())
        ORDER BY starts_at DESC NULLS LAST, created_at DESC`,
    )
    return rows.map(toOffer)
  },

  /** Published offers running now, and published ones waiting for their start date. */
  async counts(): Promise<{ active: number; scheduled: number }> {
    const db = await getDb()
    const { rows } = await db.query<{ active: number; scheduled: number }>(
      `SELECT
         COUNT(*) FILTER (WHERE (starts_at IS NULL OR starts_at <= now()) AND (ends_at IS NULL OR ends_at > now()))::int AS active,
         COUNT(*) FILTER (WHERE starts_at > now())::int AS scheduled
         FROM offers WHERE status = 'published'`,
    )
    return rows[0]
  },

  async listAll(): Promise<Offer[]> {
    const db = await getDb()
    const { rows } = await db.query<OfferRow>('SELECT * FROM offers ORDER BY created_at DESC')
    return rows.map(toOffer)
  },

  async create(input: OfferInput): Promise<Offer> {
    const db = await getDb()
    const { rows } = await db.query<OfferRow>(
      `INSERT INTO offers
         (id, title, description, discount_text, banner_image_url, banner_image_alt,
          cta_label, cta_url, starts_at, ends_at, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        randomUUID(),
        input.title,
        input.description,
        input.discountText,
        input.bannerImageUrl,
        input.bannerImageAlt,
        input.ctaLabel,
        input.ctaUrl,
        input.startsAt,
        input.endsAt,
        input.status,
      ],
    )
    return toOffer(rows[0])
  },

  async update(id: string, patch: Partial<OfferInput>): Promise<Offer | null> {
    const { assignments, params } = buildUpdate(patch, offerColumns)
    const db = await getDb()
    const { rows } = await db.query<OfferRow>(
      assignments
        ? `UPDATE offers SET ${assignments}, updated_at = now() WHERE id = $${params.length + 1} RETURNING *`
        : 'SELECT * FROM offers WHERE id = $1',
      [...params, id],
    )
    return rows[0] ? toOffer(rows[0]) : null
  },

  async delete(id: string): Promise<boolean> {
    const db = await getDb()
    const { rows } = await db.query('DELETE FROM offers WHERE id = $1 RETURNING id', [id])
    return rows.length > 0
  },
}
