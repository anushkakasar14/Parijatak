import { randomUUID } from 'node:crypto'
import type { Queryable } from '../config/database.ts'
import { HttpError } from '../utils/httpError.ts'
import { toIso } from '../utils/sql.ts'

/** One picture in a product's gallery. */
export interface ProductImageRecord {
  id: string
  productId: string
  /** The uploaded file behind the picture, or null for a file that ships with the site or an outside address. */
  mediaAssetId: string | null
  url: string
  altText: string
  position: number
  isPrimary: boolean
  createdAt: string
}

interface Row {
  id: string
  product_id: string
  media_asset_id: string | null
  url: string
  alt_text: string
  position: number
  is_primary: boolean
  created_at: Date
}

const toRecord = (row: Row): ProductImageRecord => ({
  id: row.id,
  productId: row.product_id,
  mediaAssetId: row.media_asset_id,
  url: row.url,
  altText: row.alt_text,
  position: row.position,
  isPrimary: row.is_primary,
  createdAt: toIso(row.created_at),
})

/**
 * product_images is the record of each product's pictures. The older columns on products
 * (image_url, image_alt, additional_images) are a copy kept in step by `syncProduct`,
 * always inside the same transaction, so pages and integrations that read them see the
 * same gallery.
 */
export const productImageModel = {
  /** In gallery order: by position. */
  async list(db: Queryable, productId: string): Promise<ProductImageRecord[]> {
    const { rows } = await db.query<Row>(
      'SELECT * FROM product_images WHERE product_id = $1 ORDER BY position, created_at, id',
      [productId],
    )
    return rows.map(toRecord)
  },

  /** The uploaded file at this address, if it is one. */
  async mediaAssetFor(db: Queryable, url: string): Promise<string | null> {
    const { rows } = await db.query<{ id: string }>('SELECT id FROM media_assets WHERE url = $1', [url])
    return rows[0]?.id ?? null
  },

  /**
   * Replaces a product's whole gallery: the first picture becomes the primary one.
   * Used by the product form, which sends the main picture and the extra ones together.
   */
  async replaceAll(db: Queryable, productId: string, images: { url: string; alt: string }[]): Promise<void> {
    // Pictures that stay keep their id; only new ones are added and missing ones removed.
    const existing = await this.list(db, productId)
    const kept = new Set<string>()
    // Clear the primary flag first: the one-primary rule is checked row by row.
    await db.query('UPDATE product_images SET is_primary = FALSE WHERE product_id = $1 AND is_primary', [productId])
    for (const [position, image] of images.entries()) {
      const match = existing.find((row) => row.url === image.url && !kept.has(row.id))
      if (match) {
        kept.add(match.id)
        await db.query(
          'UPDATE product_images SET alt_text = $2, position = $3, is_primary = $4, updated_at = now() WHERE id = $1',
          [match.id, image.alt, position, position === 0],
        )
      } else {
        await db.query(
          `INSERT INTO product_images (id, product_id, media_asset_id, url, alt_text, position, is_primary)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            randomUUID(),
            productId,
            await this.mediaAssetFor(db, image.url),
            image.url,
            image.alt,
            position,
            position === 0,
          ],
        )
      }
    }
    const removed = existing.filter((row) => !kept.has(row.id)).map((row) => row.id)
    if (removed.length) await db.query('DELETE FROM product_images WHERE id = ANY($1::uuid[])', [removed])
    await this.syncProduct(db, productId)
  },

  /** The gallery as the product's older columns describe it: main picture first. */
  fromProductColumns(row: { image_url: string; image_alt: string | null; additional_images: unknown[] }) {
    const extras = (row.additional_images ?? []).map((item) =>
      typeof item === 'string'
        ? { url: item, alt: '' }
        : {
            url: String((item as { url: string }).url),
            alt: String((item as { alt?: string }).alt ?? ''),
          },
    )
    return [{ url: row.image_url, alt: row.image_alt ?? '' }, ...extras].filter((image) => image.url)
  },

  /** Copies another product's gallery (used when duplicating a product). */
  async copy(db: Queryable, fromProductId: string, toProductId: string): Promise<void> {
    for (const image of await this.list(db, fromProductId)) {
      await db.query(
        `INSERT INTO product_images (id, product_id, media_asset_id, url, alt_text, position, is_primary)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [randomUUID(), toProductId, image.mediaAssetId, image.url, image.altText, image.position, image.isPrimary],
      )
    }
  },

  /**
   * Writes the gallery into the product's older picture columns: the primary picture as
   * image_url, the others in order as additional_images. A product always has a main
   * picture there, so the last picture of a product cannot be removed (checked by callers).
   */
  async syncProduct(db: Queryable, productId: string): Promise<void> {
    const images = await this.list(db, productId)
    const primary = images.find((i) => i.isPrimary) ?? images[0]
    if (!primary) return
    const others = images.filter((i) => i !== primary).map((i) => ({ url: i.url, alt: i.altText }))
    await db.query(
      `UPDATE products
          SET image_url = $2, image_alt = NULLIF($3, ''), additional_images = $4::jsonb, updated_at = now()
        WHERE id = $1`,
      [productId, primary.url, primary.altText, JSON.stringify(others)],
    )
  },

  // ── One picture at a time (admin) ───────────────────────────────────────────────
  // Each runs inside a transaction opened by the caller and ends by updating the
  // product's picture columns, so the website sees the change in the same commit.

  /**
   * Locks the product for the rest of the transaction, so two edits to one gallery cannot
   * interleave. Throws 404 if the product does not exist (or was deleted meanwhile).
   */
  async lockProduct(db: Queryable, productId: string): Promise<void> {
    const { rows } = await db.query('SELECT id FROM products WHERE id = $1 FOR UPDATE', [productId])
    if (!rows.length) throw new HttpError(404, 'Product not found')
  },

  /** The picture, if it belongs to this product; otherwise 404. */
  async findInProduct(db: Queryable, productId: string, imageId: string): Promise<ProductImageRecord> {
    const { rows } = await db.query<Row>('SELECT * FROM product_images WHERE id = $1 AND product_id = $2', [
      imageId,
      productId,
    ])
    if (!rows[0]) throw new HttpError(404, 'Picture not found in this product')
    return toRecord(rows[0])
  },

  /** An uploaded file must still exist; other addresses (site files, https) are accepted as they are. */
  async requireFile(db: Queryable, url: string): Promise<string | null> {
    const mediaId = await this.mediaAssetFor(db, url)
    if (!mediaId && url.startsWith('/api/media/')) {
      throw new HttpError(400, 'That uploaded image no longer exists. Upload it again.', { url: 'Image not found' })
    }
    return mediaId
  },

  async add(
    db: Queryable,
    productId: string,
    input: { url: string; altText: string; makePrimary: boolean },
    maxImages: number,
  ): Promise<ProductImageRecord> {
    const existing = await this.list(db, productId)
    if (existing.length >= maxImages) {
      throw new HttpError(409, `A product can have up to ${maxImages} pictures. Remove one first.`)
    }
    const mediaId = await this.requireFile(db, input.url)
    const primary = input.makePrimary || existing.length === 0
    if (primary) await db.query('UPDATE product_images SET is_primary = FALSE WHERE product_id = $1', [productId])
    const position = existing.length ? Math.max(...existing.map((i) => i.position)) + 1 : 0
    const { rows } = await db.query<Row>(
      `INSERT INTO product_images (id, product_id, media_asset_id, url, alt_text, position, is_primary)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [randomUUID(), productId, mediaId, input.url, input.altText, position, primary],
    )
    await this.syncProduct(db, productId)
    return toRecord(rows[0])
  },

  /** New description and/or a replacement picture in the same place. */
  async update(
    db: Queryable,
    productId: string,
    imageId: string,
    patch: { url?: string; altText?: string },
  ): Promise<ProductImageRecord> {
    const current = await this.findInProduct(db, productId, imageId)
    const url = patch.url ?? current.url
    const mediaId = patch.url !== undefined ? await this.requireFile(db, url) : current.mediaAssetId
    const { rows } = await db.query<Row>(
      `UPDATE product_images SET url = $2, media_asset_id = $3, alt_text = $4, updated_at = now()
        WHERE id = $1 RETURNING *`,
      [imageId, url, mediaId, patch.altText ?? current.altText],
    )
    await this.syncProduct(db, productId)
    return toRecord(rows[0])
  },

  async setPrimary(db: Queryable, productId: string, imageId: string): Promise<void> {
    await this.findInProduct(db, productId, imageId)
    await db.query('UPDATE product_images SET is_primary = FALSE WHERE product_id = $1 AND id <> $2', [productId, imageId])
    await db.query('UPDATE product_images SET is_primary = TRUE, updated_at = now() WHERE id = $1', [imageId])
    await this.syncProduct(db, productId)
  },

  /** `imageIds` must list every picture of the product exactly once, in the new order. */
  async reorder(db: Queryable, productId: string, imageIds: string[]): Promise<void> {
    const existing = await this.list(db, productId)
    const known = new Set(existing.map((i) => i.id))
    if (imageIds.length !== existing.length || !imageIds.every((id) => known.has(id))) {
      throw new HttpError(400, 'The new order must list every picture of this product exactly once.', {
        imageIds: 'Pictures do not match this product',
      })
    }
    // Positions are unique per product; the check runs at commit, so swaps are fine.
    for (const [position, id] of imageIds.entries()) {
      await db.query('UPDATE product_images SET position = $2, updated_at = now() WHERE id = $1', [id, position])
    }
    await this.syncProduct(db, productId)
  },

  /** A product always keeps at least one picture. Removing the primary one promotes the next. */
  async remove(db: Queryable, productId: string, imageId: string): Promise<void> {
    const removed = await this.findInProduct(db, productId, imageId)
    const existing = await this.list(db, productId)
    if (existing.length === 1) {
      throw new HttpError(409, 'A product needs at least one picture. Add another before removing this one.')
    }
    await db.query('DELETE FROM product_images WHERE id = $1', [imageId])
    const rest = existing.filter((i) => i.id !== imageId)
    for (const [position, image] of rest.entries()) {
      await db.query('UPDATE product_images SET position = $2 WHERE id = $1', [image.id, position])
    }
    if (removed.isPrimary) {
      await db.query('UPDATE product_images SET is_primary = TRUE WHERE id = $1', [rest[0].id])
    }
    await this.syncProduct(db, productId)
  },
}
