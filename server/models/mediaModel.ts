import { randomUUID } from 'node:crypto'
import { getDb } from '../config/database.ts'
import { toIso } from '../utils/sql.ts'

export type MediaKind = 'image' | 'video'

export interface MediaAsset {
  id: string
  kind: MediaKind
  url: string
  filename: string
  contentType: string
  byteSize: number
  width: number | null
  height: number | null
  /** Videos only. */
  durationSeconds: number | null
  altText: string
  createdAt: string
}

/** Where and how a file is stored: one object (an image), or pieces (a video). */
export interface StoredMedia extends MediaAsset {
  storageKey: string
  chunkSize: number | null
  chunkCount: number | null
}

interface MediaRow {
  id: string
  kind: MediaKind
  storage_key: string
  url: string
  filename: string
  content_type: string
  byte_size: number
  width: number | null
  height: number | null
  duration_seconds: string | number | null
  chunk_size: number | null
  chunk_count: number | null
  alt_text: string
  created_at: Date
}

const toAsset = (row: MediaRow): MediaAsset => ({
  id: row.id,
  kind: row.kind,
  url: row.url,
  filename: row.filename,
  contentType: row.content_type,
  byteSize: row.byte_size,
  width: row.width,
  height: row.height,
  durationSeconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
  altText: row.alt_text,
  createdAt: toIso(row.created_at),
})

const toStored = (row: MediaRow): StoredMedia => ({
  ...toAsset(row),
  storageKey: row.storage_key,
  chunkSize: row.chunk_size,
  chunkCount: row.chunk_count,
})

/** A video upload that has started but not finished. */
export interface MediaUpload {
  id: string
  filename: string
  contentType: string
  byteSize: number
  chunkSize: number
  chunkCount: number
  receivedChunks: number[]
  width: number | null
  height: number | null
  durationSeconds: number | null
  uploadedBy: string | null
}

interface UploadRow {
  id: string
  filename: string
  content_type: string
  byte_size: number
  chunk_size: number
  chunk_count: number
  received_chunks: number[]
  width: number | null
  height: number | null
  duration_seconds: string | number | null
  uploaded_by: string | null
}

const toUpload = (row: UploadRow): MediaUpload => ({
  id: row.id,
  filename: row.filename,
  contentType: row.content_type,
  byteSize: row.byte_size,
  chunkSize: row.chunk_size,
  chunkCount: row.chunk_count,
  receivedChunks: row.received_chunks,
  width: row.width,
  height: row.height,
  durationSeconds: row.duration_seconds === null ? null : Number(row.duration_seconds),
  uploadedBy: row.uploaded_by,
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
    kind?: MediaKind
    chunkSize?: number | null
    chunkCount?: number | null
    durationSeconds?: number | null
    id?: string
  }): Promise<MediaAsset> {
    const db = await getDb()
    const { rows } = await db.query<MediaRow>(
      `INSERT INTO media_assets
         (id, storage_key, url, filename, content_type, byte_size, width, height, alt_text, uploaded_by,
          kind, chunk_size, chunk_count, duration_seconds)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        input.id ?? randomUUID(),
        input.storageKey,
        input.url,
        input.filename,
        input.contentType,
        input.byteSize,
        input.width,
        input.height,
        input.altText,
        input.uploadedBy,
        input.kind ?? 'image',
        input.chunkSize ?? null,
        input.chunkCount ?? null,
        input.durationSeconds ?? null,
      ],
    )
    return toAsset(rows[0])
  },

  async list(filter: { search?: string; kind?: MediaKind; limit: number; offset: number }) {
    const db = await getDb()
    const params: unknown[] = []
    const where: string[] = []
    if (filter.search) {
      params.push(`%${filter.search.replace(/[\\%_]/g, '\\$&')}%`)
      where.push(`(filename ILIKE $${params.length} OR alt_text ILIKE $${params.length})`)
    }
    if (filter.kind) {
      params.push(filter.kind)
      where.push(`kind = $${params.length}`)
    }
    const condition = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const { rows } = await db.query<MediaRow>(
      `SELECT * FROM media_assets ${condition} ORDER BY created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filter.limit, filter.offset],
    )
    const count = await db.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM media_assets ${condition}`,
      params,
    )
    return { assets: rows.map(toAsset), total: count.rows[0].total }
  },

  async findById(id: string): Promise<StoredMedia | null> {
    const db = await getDb()
    const { rows } = await db.query<MediaRow>('SELECT * FROM media_assets WHERE id = $1', [id])
    return rows[0] ? toStored(rows[0]) : null
  },

  /** The file behind a public address, for serving a video in pieces. */
  async findByUrl(url: string): Promise<StoredMedia | null> {
    const db = await getDb()
    const { rows } = await db.query<MediaRow>('SELECT * FROM media_assets WHERE url = $1', [url])
    return rows[0] ? toStored(rows[0]) : null
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
   * so no page is left pointing at a missing picture or video.
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

  // ── Video uploads in progress ───────────────────────────────────────────────────

  async createUpload(input: Omit<MediaUpload, 'id' | 'receivedChunks'>): Promise<MediaUpload> {
    const db = await getDb()
    const { rows } = await db.query<UploadRow>(
      `INSERT INTO media_uploads
         (id, filename, content_type, byte_size, chunk_size, chunk_count, width, height, duration_seconds, uploaded_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        randomUUID(),
        input.filename,
        input.contentType,
        input.byteSize,
        input.chunkSize,
        input.chunkCount,
        input.width,
        input.height,
        input.durationSeconds,
        input.uploadedBy,
      ],
    )
    return toUpload(rows[0])
  },

  async findUpload(id: string): Promise<MediaUpload | null> {
    const db = await getDb()
    const { rows } = await db.query<UploadRow>('SELECT * FROM media_uploads WHERE id = $1', [id])
    return rows[0] ? toUpload(rows[0]) : null
  },

  /** Records that a piece arrived. Sending the same piece again (a retry) is harmless. */
  async markChunk(id: string, index: number): Promise<MediaUpload | null> {
    const db = await getDb()
    const { rows } = await db.query<UploadRow>(
      `UPDATE media_uploads
          SET received_chunks = ARRAY(SELECT DISTINCT unnest(received_chunks || $2::int) ORDER BY 1)
        WHERE id = $1
        RETURNING *`,
      [id, index],
    )
    return rows[0] ? toUpload(rows[0]) : null
  },

  async deleteUpload(id: string): Promise<void> {
    const db = await getDb()
    await db.query('DELETE FROM media_uploads WHERE id = $1', [id])
  },

  /** Uploads abandoned for longer than `hours` (a closed tab, a lost connection). */
  async staleUploads(hours: number): Promise<MediaUpload[]> {
    const db = await getDb()
    const { rows } = await db.query<UploadRow>(
      `SELECT * FROM media_uploads WHERE created_at < now() - make_interval(hours => $1)`,
      [hours],
    )
    return rows.map(toUpload)
  },
}
