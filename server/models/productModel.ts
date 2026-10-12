import { db } from '../config/database.ts'

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
  price: number | null
  image_url: string
  additional_images: string
  customization_available: number
  is_featured: number
  is_active: number
  created_at: string
  updated_at: string
}

function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    category: row.category,
    description: row.description,
    material: row.material,
    price: row.price,
    imageUrl: row.image_url,
    additionalImages: JSON.parse(row.additional_images) as string[],
    customizationAvailable: row.customization_available === 1,
    isFeatured: row.is_featured === 1,
    isActive: row.is_active === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export const productModel = {
  /** Active products only — inactive ones are never exposed publicly. */
  findActive(filter: { featured?: boolean; category?: string } = {}): Product[] {
    const where = ['is_active = 1']
    const params: (string | number)[] = []

    if (filter.featured !== undefined) {
      where.push('is_featured = ?')
      params.push(filter.featured ? 1 : 0)
    }
    if (filter.category) {
      where.push('category = ? COLLATE NOCASE')
      params.push(filter.category)
    }

    const rows = db
      .prepare(`SELECT * FROM products WHERE ${where.join(' AND ')} ORDER BY created_at, name`)
      .all(...params) as unknown as ProductRow[]
    return rows.map(toProduct)
  },

  /** Looks up an active product by id or slug. */
  findActiveByIdOrSlug(idOrSlug: string): Product | null {
    const row = db
      .prepare('SELECT * FROM products WHERE is_active = 1 AND (id = ? OR slug = ?)')
      .get(idOrSlug, idOrSlug) as unknown as ProductRow | undefined
    return row ? toProduct(row) : null
  },
}
