import type { ProductSize } from '../../shared/productPricing.ts'
import { randomUUID } from 'node:crypto'
import { getDb } from '../config/database.ts'
import { buildUpdate, toIso, translateConstraintError } from '../utils/sql.ts'
import { productImageModel } from './productImageModel.ts'

export const publicationStatuses = ['draft', 'published', 'archived'] as const
export type PublicationStatus = (typeof publicationStatuses)[number]

export interface ProductImage {
  url: string
  alt: string
}

export interface Product {
  id: string
  name: string
  slug: string
  /** Category name, kept for older API consumers. */
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
  /** Extra images, as plain URLs (older shape). */
  additionalImages: string[]
  /** Main image followed by the extra ones, each with its alternative text. */
  images: ProductImage[]
  customizationAvailable: boolean
  isFeatured: boolean
  displayOrder: number
  status: PublicationStatus
  createdAt: string
  updatedAt: string
}

interface ProductRow {
  id: string
  name: string
  slug: string
  category: string
  category_id: string | null
  category_name: string | null
  short_description: string | null
  description: string
  material: string | null
  craftsmanship: string | null
  dimensions: string | null
  variants: string[]
  sizes: ProductSize[] | null
  price: string | number | null
  offer_price: string | number | null
  image_url: string
  image_alt: string | null
  additional_images: (string | ProductImage)[]
  customization_available: boolean
  is_featured: boolean
  display_order: number
  status: PublicationStatus
  created_at: Date
  updated_at: Date
}

const numberOrNull = (value: string | number | null) => (value === null ? null : Number(value))

function toProduct(row: ProductRow): Product {
  // Extra images were once stored as bare URLs; accept both shapes.
  const extras = row.additional_images.map((image) =>
    typeof image === 'string' ? { url: image, alt: '' } : { url: image.url, alt: image.alt ?? '' },
  )
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    category: row.category_name ?? row.category,
    categoryId: row.category_id,
    shortDescription: row.short_description,
    description: row.description,
    material: row.material,
    craftsmanship: row.craftsmanship,
    dimensions: row.dimensions,
    variants: row.variants,
    sizes: (row.sizes ?? []).map((size) => ({ label: size.label, price: size.price ?? null })),
    price: numberOrNull(row.price),
    offerPrice: numberOrNull(row.offer_price),
    imageUrl: row.image_url,
    imageAlt: row.image_alt,
    additionalImages: extras.map((image) => image.url),
    images: [{ url: row.image_url, alt: row.image_alt ?? '' }, ...extras],
    customizationAvailable: row.customization_available,
    isFeatured: row.is_featured,
    displayOrder: row.display_order,
    status: row.status,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  }
}

const SELECT = `
  SELECT p.*, c.name AS category_name
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id`

const ORDER = 'ORDER BY p.display_order, p.created_at, p.name'

/** Sort orders the admin list offers. Built from a fixed list — never from raw input. */
function adminOrder(sort: 'order' | 'name' | 'created' | 'updated' = 'order', direction?: 'asc' | 'desc') {
  const defaults = { order: 'ASC', name: 'ASC', created: 'DESC', updated: 'DESC' } as const
  const dir = direction ? (direction === 'asc' ? 'ASC' : 'DESC') : defaults[sort]
  const columns = { order: 'p.display_order', name: 'lower(p.name)', created: 'p.created_at', updated: 'p.updated_at' }
  return `ORDER BY ${columns[sort]} ${dir}, p.name ASC`
}

export interface ProductInput {
  name: string
  slug: string
  categoryId: string
  shortDescription: string | null
  description: string
  material: string | null
  craftsmanship: string | null
  dimensions: string | null
  variants: string[]
  sizes: ProductSize[]
  price: number | null
  offerPrice: number | null
  imageUrl: string
  imageAlt: string | null
  additionalImages: ProductImage[]
  customizationAvailable: boolean
  isFeatured: boolean
  displayOrder: number
  status: PublicationStatus
}

const columns: Record<keyof ProductInput, string> = {
  name: 'name',
  slug: 'slug',
  categoryId: 'category_id',
  shortDescription: 'short_description',
  description: 'description',
  material: 'material',
  craftsmanship: 'craftsmanship',
  dimensions: 'dimensions',
  variants: 'variants',
  sizes: 'sizes',
  price: 'price',
  offerPrice: 'offer_price',
  imageUrl: 'image_url',
  imageAlt: 'image_alt',
  additionalImages: 'additional_images',
  customizationAvailable: 'customization_available',
  isFeatured: 'is_featured',
  displayOrder: 'display_order',
  status: 'status',
}

const constraintMessages = {
  unique: 'Another product already uses this web address (slug). Choose a different one.',
  foreignKey: 'That category does not exist.',
}

export const productModel = {
  // ── Public: published products only ─────────────────────────────────────────────

  /** `category` may be a category id or its name. */
  async findPublished(filter: { featured?: boolean; category?: string } = {}): Promise<Product[]> {
    const where = [`p.status = 'published'`]
    const params: unknown[] = []

    if (filter.featured !== undefined) {
      params.push(filter.featured)
      where.push(`p.is_featured = $${params.length}`)
    }
    if (filter.category) {
      params.push(filter.category)
      where.push(`(p.category_id = $${params.length} OR lower(c.name) = lower($${params.length}))`)
    }

    const db = await getDb()
    const { rows } = await db.query<ProductRow>(
      `${SELECT} WHERE ${where.join(' AND ')} AND (c.id IS NULL OR c.is_active) ${ORDER}`,
      params,
    )
    return rows.map(toProduct)
  },

  async findPublishedByIdOrSlug(idOrSlug: string): Promise<Product | null> {
    const db = await getDb()
    const { rows } = await db.query<ProductRow>(
      `${SELECT} WHERE p.status = 'published' AND (c.id IS NULL OR c.is_active) AND (p.id = $1 OR p.slug = $1)`,
      [idOrSlug],
    )
    return rows[0] ? toProduct(rows[0]) : null
  },

  async counts(): Promise<{ total: number; active: number; published: number; draft: number; archived: number }> {
    const db = await getDb()
    const { rows } = await db.query<{ total: number; published: number; draft: number; archived: number }>(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE status = 'published')::int AS published,
              COUNT(*) FILTER (WHERE status = 'draft')::int AS draft,
              COUNT(*) FILTER (WHERE status = 'archived')::int AS archived
         FROM products`,
    )
    // `active` is kept for older callers; it means published.
    return { ...rows[0], active: rows[0].published }
  },

  // ── Admin: every status ─────────────────────────────────────────────────────────

  async adminList(filter: {
    status?: PublicationStatus
    categoryId?: string
    search?: string
    sort?: 'order' | 'name' | 'created' | 'updated'
    direction?: 'asc' | 'desc'
    limit: number
    offset: number
  }): Promise<{ products: Product[]; total: number }> {
    const where: string[] = []
    const params: unknown[] = []
    const add = (clause: (p: string) => string, value: unknown) => {
      params.push(value)
      where.push(clause(`$${params.length}`))
    }

    if (filter.status) add((p) => `p.status = ${p}`, filter.status)
    if (filter.categoryId) add((p) => `p.category_id = ${p}`, filter.categoryId)
    if (filter.search) {
      add(
        (p) => `(p.name ILIKE ${p} OR p.slug ILIKE ${p} OR p.description ILIKE ${p})`,
        `%${filter.search.replace(/[\\%_]/g, '\\$&')}%`,
      )
    }
    const condition = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const db = await getDb()
    const { rows } = await db.query<ProductRow>(
      `${SELECT} ${condition} ${adminOrder(filter.sort, filter.direction)} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filter.limit, filter.offset],
    )
    const count = await db.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM products p ${condition}`,
      params,
    )
    return { products: rows.map(toProduct), total: count.rows[0].total }
  },

  async findById(id: string): Promise<Product | null> {
    const db = await getDb()
    const { rows } = await db.query<ProductRow>(`${SELECT} WHERE p.id = $1`, [id])
    return rows[0] ? toProduct(rows[0]) : null
  },

  async create(input: ProductInput): Promise<Product> {
    const db = await getDb()
    const id = randomUUID()
    try {
      await db.transaction(async (tx) => {
        // `category` and `is_active` are legacy columns, kept in step for older deployments.
        await tx.query(
          `INSERT INTO products
             (id, name, slug, category, category_id, short_description, description, material,
              craftsmanship, dimensions, variants, price, offer_price, image_url, image_alt,
              additional_images, customization_available, is_featured, display_order, status, is_active,
              sizes)
           VALUES ($1, $2, $3, (SELECT name FROM categories WHERE id = $4), $4, $5, $6, $7, $8, $9,
                   $10::jsonb, $11, $12, $13, $14, $15::jsonb, $16, $17, $18, $19, $19 = 'published',
                   $20::jsonb)`,
          [
            id,
            input.name,
            input.slug,
            input.categoryId,
            input.shortDescription,
            input.description,
            input.material,
            input.craftsmanship,
            input.dimensions,
            JSON.stringify(input.variants),
            input.price,
            input.offerPrice,
            input.imageUrl,
            input.imageAlt,
            JSON.stringify(input.additionalImages),
            input.customizationAvailable,
            input.isFeatured,
            input.displayOrder,
            input.status,
            JSON.stringify(input.sizes ?? []),
          ],
        )
        await productImageModel.replaceAll(tx, id, [
          { url: input.imageUrl, alt: input.imageAlt ?? '' },
          ...input.additionalImages,
        ])
      })
    } catch (err) {
      translateConstraintError(err, constraintMessages)
    }
    return (await this.findById(id)) as Product
  },

  async update(id: string, patch: Partial<ProductInput>): Promise<Product | null> {
    const { assignments, params } = buildUpdate(patch, columns, ['variants', 'sizes', 'additionalImages'])
    if (!assignments) return this.findById(id)

    const db = await getDb()
    const touchesImages =
      patch.imageUrl !== undefined || patch.imageAlt !== undefined || patch.additionalImages !== undefined
    try {
      const found = await db.transaction(async (tx) => {
        const result = await tx.query(
          `UPDATE products SET ${assignments}, updated_at = now()
            WHERE id = $${params.length + 1}
            RETURNING id`,
          [...params, id],
        )
        if (!result.rows.length) return false
        // `category` and `is_active` are legacy columns, kept in step for older deployments.
        await tx.query(
          `UPDATE products
              SET category  = COALESCE((SELECT name FROM categories WHERE id = products.category_id), category),
                  is_active = (status = 'published')
            WHERE id = $1`,
          [id],
        )
        // The product form sends the main and extra pictures as columns: bring the gallery in line.
        if (touchesImages) {
          const { rows } = await tx.query<{ image_url: string; image_alt: string | null; additional_images: unknown[] }>(
            'SELECT image_url, image_alt, additional_images FROM products WHERE id = $1',
            [id],
          )
          await productImageModel.replaceAll(tx, id, productImageModel.fromProductColumns(rows[0]))
        }
        return true
      })
      if (!found) return null
    } catch (err) {
      translateConstraintError(err, constraintMessages)
    }
    return this.findById(id)
  },

  /** Copies a product as a hidden draft, with "(copy)" in its name and a free web address. */
  async duplicate(id: string): Promise<Product | null> {
    const original = await this.findById(id)
    if (!original) return null
    const db = await getDb()

    const base = `${original.slug}-copy`.slice(0, 60)
    const { rows: taken } = await db.query<{ slug: string }>(
      'SELECT slug FROM products WHERE slug = $1 OR slug LIKE $2',
      [base, `${base}-%`],
    )
    const used = new Set(taken.map((r) => r.slug))
    let slug = base
    for (let n = 2; used.has(slug); n++) slug = `${base}-${n}`

    const newId = randomUUID()
    await db.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO products
           (id, name, slug, category, category_id, short_description, description, material, craftsmanship,
            dimensions, variants, price, offer_price, image_url, image_alt, additional_images,
            customization_available, is_featured, display_order, status, is_active, sizes)
         SELECT $1, left(name || ' (copy)', 120), $2, category, category_id, short_description, description,
                material, craftsmanship, dimensions, variants, price, offer_price, image_url, image_alt,
                additional_images, customization_available, FALSE, display_order, 'draft', FALSE, sizes
           FROM products WHERE id = $3`,
        [newId, slug, id],
      )
      await productImageModel.copy(tx, id, newId)
    })
    return this.findById(newId)
  },

  /** Enquiries about the product keep their saved product name; only the link is cleared. */
  async delete(id: string): Promise<boolean> {
    const db = await getDb()
    const { rows } = await db.query('DELETE FROM products WHERE id = $1 RETURNING id', [id])
    return rows.length > 0
  },
}
