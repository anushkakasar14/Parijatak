import { randomUUID } from 'node:crypto'
import {
  defaultCategories,
  defaultProducts,
  defaultSections,
  defaultSettings,
  defaultSlides,
} from '../../shared/defaultContent.ts'
import type { Queryable } from './database.ts'

/**
 * Writes the website's starting content (shared/defaultContent.ts) into the database.
 * Run once, by migration 3. After that the database is the source of truth: nothing
 * here is re-applied, so edits and deletions made later stick.
 */
export async function seedContent(tx: Queryable): Promise<void> {
  for (const [index, c] of defaultCategories.entries()) {
    await tx.query(
      `INSERT INTO categories (id, name, display_order) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [c.id, c.name, index + 1],
    )
  }

  // New databases get the three launch products. Where a product already exists, only
  // its new, still-empty fields are filled in — existing values are left alone.
  for (const [index, p] of defaultProducts.entries()) {
    await tx.query(
      `INSERT INTO products
         (id, name, slug, category, category_id, short_description, description,
          image_url, image_alt, display_order, is_featured, is_active, status)
       VALUES ($1, $2, $1, $2, $1, $3, $4, $5, $6, $7, TRUE, TRUE, 'published')
       ON CONFLICT (id) DO UPDATE SET
         short_description = COALESCE(products.short_description, EXCLUDED.short_description),
         image_alt         = COALESCE(products.image_alt, EXCLUDED.image_alt),
         category_id       = COALESCE(products.category_id, EXCLUDED.category_id),
         display_order     = CASE WHEN products.display_order = 0
                                  THEN EXCLUDED.display_order ELSE products.display_order END`,
      [p.id, p.name, p.shortDescription, p.description, p.imageUrl, p.imageAlt, index + 1],
    )
  }

  for (const [index, s] of defaultSlides.entries()) {
    await tx.query(
      `INSERT INTO homepage_slides
         (id, media_type, media_url, poster_url, alt_text, eyebrow, heading, description,
          cta_label, cta_url, display_order, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'published')`,
      [
        randomUUID(),
        s.mediaType,
        s.mediaUrl,
        s.posterUrl,
        s.altText,
        s.eyebrow,
        s.heading,
        s.description,
        s.ctaLabel,
        s.ctaUrl,
        index + 1,
      ],
    )
  }

  for (const [key, value] of Object.entries(defaultSettings)) {
    await tx.query(
      `INSERT INTO site_settings (key, value) VALUES ($1, $2::jsonb) ON CONFLICT DO NOTHING`,
      [key, JSON.stringify(value)],
    )
  }

  for (const [index, [id, s]] of Object.entries(defaultSections).entries()) {
    await tx.query(
      `INSERT INTO page_sections
         (id, page, label, eyebrow, heading, body, image_url, image_alt, cta_label, cta_url, display_order)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT DO NOTHING`,
      [id, id.split('.')[0], s.label, s.eyebrow, s.heading, s.body, s.imageUrl, s.imageAlt, s.ctaLabel, s.ctaUrl, index + 1],
    )
  }
}
