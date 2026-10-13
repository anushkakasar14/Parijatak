import { getDb } from '../config/database.ts'

export interface Product {
  id: string
  name: string
  slug: string
  category: string
  description: string
  material: string | null
  price: number | null
  imageUrl: string
  additionalImages: string[]
  customizationAvailable: boolean
  isFeatured: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
}

interface ProductRow {
  id: string
  name: string
  slug: string
  category: string
  description: string
  material: string | null
  price: string | number | null
  image_url: string
  additional_images: string[]
  customization_available: boolean
  is_featured: boolean
  is_active: boolean
  created_at: Date
  updated_at: Date
}

function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    category: row.category,
    description: row.description,
    material: row.material,
    price: row.price === null ? null : Number(row.price),
    imageUrl: row.image_url,
    additionalImages: row.additional_images,
    customizationAvailable: row.customization_available,
    isFeatured: row.is_featured,
    isActive: row.is_active,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  }
}

export const productModel = {
  /** Active products only — inactive ones are never exposed publicly. */
  async findActive(filter: { featured?: boolean; category?: string } = {}): Promise<Product[]> {
    const where = ['is_active']
    const params: unknown[] = []

    if (filter.featured !== undefined) {
      params.push(filter.featured)
      where.push(`is_featured = $${params.length}`)
    }
    if (filter.category) {
      params.push(filter.category)
      where.push(`lower(category) = lower($${params.length})`)
    }

    const db = await getDb()
    const { rows } = await db.query<ProductRow>(
      `SELECT * FROM products WHERE ${where.join(' AND ')} ORDER BY created_at, name`,
      params,
    )
    return rows.map(toProduct)
  },

  async counts(): Promise<{ total: number; active: number }> {
    const db = await getDb()
    const { rows } = await db.query<{ total: number; active: number }>(
      'SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE is_active)::int AS active FROM products',
    )
    return rows[0]
  },

  /** Looks up an active product by id or slug. */
  async findActiveByIdOrSlug(idOrSlug: string): Promise<Product | null> {
    const db = await getDb()
    const { rows } = await db.query<ProductRow>(
      'SELECT * FROM products WHERE is_active AND (id = $1 OR slug = $1)',
      [idOrSlug],
    )
    return rows[0] ? toProduct(rows[0]) : null
  },
}
