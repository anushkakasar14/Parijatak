import { randomUUID } from 'node:crypto'
import { getDb } from '../config/database.ts'
import { toIso } from '../utils/sql.ts'

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

interface MediaRow {
  id: string
  storage_key: string
  url: string
  filename: string
  content_type: string
  byte_size: number
  width: number | null
  height: number | null
  alt_text: string
  created_at: Date
}

const toAsset = (row: MediaRow): MediaAsset => ({
  id: row.id,
  url: row.url,
  filename: row.filename,
  contentType: row.content_type,
  byteSize: row.byte_size,
  width: row.width,
  height: row.height,
  altText: row.alt_text,
  createdAt: toIso(row.created_at),
})

export const mediaModel = {
  async create(input: {
    storageKey: string
    url: string
    filename: string
    contentType: string
    byteSize: number
    width: number | null
    height: number | null
    altText: string
    uploadedBy: string | null
  }): Promise<MediaAsset> {
    const db = await getDb()
    const { rows } = await db.query<MediaRow>(
      `INSERT INTO media_assets
         (id, storage_key, url, filename, content_type, byte_size, width, height, alt_text, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        randomUUID(),
        input.storageKey,
        input.url,
        input.filename,
        input.contentType,
        input.byteSize,
        input.width,
        input.height,
        input.altText,
        input.uploadedBy,
      ],
    )
    return toAsset(rows[0])
  },

  async list(filter: { search?: string; limit: number; offset: number }) {
    const db = await getDb()
    const params: unknown[] = []
    let where = ''
    if (filter.search) {
      params.push(`%${filter.search.replace(/[\\%_]/g, '\\$&')}%`)
      where = 'WHERE filename ILIKE $1 OR alt_text ILIKE $1'
    }
    const { rows } = await db.query<MediaRow>(
      `SELECT * FROM media_assets ${where} ORDER BY created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filter.limit, filter.offset],
    )
    const count = await db.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM media_assets ${where}`,
      params,
    )
    return { assets: rows.map(toAsset), total: count.rows[0].total }
  },

  async findById(id: string): Promise<(MediaAsset & { storageKey: string }) | null> {
    const db = await getDb()
    const { rows } = await db.query<MediaRow>('SELECT * FROM media_assets WHERE id = $1', [id])
    return rows[0] ? { ...toAsset(rows[0]), storageKey: rows[0].storage_key } : null
  },

  async updateAlt(id: string, altText: string): Promise<MediaAsset | null> {
    const db = await getDb()
    const { rows } = await db.query<MediaRow>(
      'UPDATE media_assets SET alt_text = $1, updated_at = now() WHERE id = $2 RETURNING *',
      [altText, id],
    )
    return rows[0] ? toAsset(rows[0]) : null
  },

  async delete(id: string): Promise<void> {
    const db = await getDb()
    await db.query('DELETE FROM media_assets WHERE id = $1', [id])
  },

  /**
   * Where a file address is still used on the website. A file in use is never deleted,
   * so no page is left pointing at a missing picture.
   */
  async usage(url: string): Promise<string[]> {
    const db = await getDb()
    const { rows } = await db.query<{ place: string }>(
      `SELECT 'Product: ' || name AS place FROM products
        WHERE image_url = $1 OR additional_images::text LIKE '%' || $2 || '%'
       UNION ALL
       SELECT 'Carousel slide: ' || heading FROM homepage_slides WHERE media_url = $1 OR poster_url = $1
       UNION ALL
       SELECT 'Page text: ' || label FROM page_sections WHERE image_url = $1
       UNION ALL
       SELECT 'Offer: ' || title FROM offers WHERE banner_image_url = $1
       UNION ALL
       SELECT 'Site settings: ' || key FROM site_settings WHERE value::text LIKE '%' || $2 || '%'`,
      [url, JSON.stringify(url).slice(1, -1)],
    )
    return rows.map((r) => r.place)
  },
}
