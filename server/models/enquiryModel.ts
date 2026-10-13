import { randomUUID } from 'node:crypto'
import { getDb } from '../config/database.ts'
import type { Queryable } from '../config/database.ts'
import type { enquirySources, enquiryStatuses } from '../utils/schemas.ts'

export type EnquiryStatus = (typeof enquiryStatuses)[number]
export type EnquirySource = (typeof enquirySources)[number]

export interface Enquiry {
  id: string
  name: string
  email: string
  phone: string
  inquiryType: string
  message: string
  productId: string | null
  productName: string | null
  source: EnquirySource
  status: EnquiryStatus
  createdAt: string
  updatedAt: string
  /** When the enquiry was copied to Google Sheets, or null if it has not been yet. */
  sheetSyncedAt: string | null
  /** Why the last attempt to copy it failed, if it did. */
  sheetSyncError: string | null
  /** Private notes for staff. Never returned by a public endpoint. */
  internalNotes: string | null
}

interface EnquiryRow {
  id: string
  name: string
  email: string
  phone: string
  inquiry_type: string
  message: string
  product_id: string | null
  product_name: string | null
  source: EnquirySource
  status: EnquiryStatus
  created_at: Date
  updated_at: Date
  sheet_synced_at: Date | null
  sheet_sync_error: string | null
  internal_notes: string | null
}

function toEnquiry(row: EnquiryRow): Enquiry {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    inquiryType: row.inquiry_type,
    message: row.message,
    productId: row.product_id,
    productName: row.product_name,
    source: row.source,
    status: row.status,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
    sheetSyncedAt: row.sheet_synced_at ? new Date(row.sheet_synced_at).toISOString() : null,
    sheetSyncError: row.sheet_sync_error,
    internalNotes: row.internal_notes,
  }
}

export type NewEnquiry = Pick<
  Enquiry,
  'name' | 'email' | 'phone' | 'inquiryType' | 'message' | 'productId' | 'productName' | 'source'
>

export interface EnquiryFilters {
  status?: EnquiryStatus
  inquiryType?: string
  source?: EnquirySource
  productId?: string
  /** true = only enquiries about a product; false = only general ones. */
  hasProduct?: boolean
  /** true = already in Google Sheets; false = still waiting to be copied. */
  synced?: boolean
  /** Free-text search across name, email, phone, message and product name. */
  search?: string
  from?: Date
  to?: Date
  limit: number
  offset: number
}

/** Collapses whitespace and case so "Hello  there" and "hello there" compare equal. */
const NORMALISED_MESSAGE = `lower(regexp_replace(btrim(message), '\\s+', ' ', 'g'))`

export const enquiryModel = {
  async create(input: NewEnquiry, tx?: Queryable): Promise<Enquiry> {
    const db = tx ?? (await getDb())
    const { rows } = await db.query<EnquiryRow>(
      `INSERT INTO enquiries
         (id, name, email, phone, inquiry_type, message, product_id, product_name, source)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        randomUUID(),
        input.name,
        input.email,
        input.phone,
        input.inquiryType,
        input.message,
        input.productId,
        input.productName,
        input.source,
      ],
    )
    return toEnquiry(rows[0])
  },

  /**
   * Finds an identical enquiry — same person, type, product and message — submitted
   * within the last `windowMinutes`. Used to absorb accidental double submissions.
   */
  async findRecentDuplicate(
    input: NewEnquiry,
    windowMinutes: number,
    tx?: Queryable,
  ): Promise<Enquiry | null> {
    const db = tx ?? (await getDb())
    const { rows } = await db.query<EnquiryRow>(
      `SELECT * FROM enquiries
        WHERE email = $1
          AND phone = $2
          AND inquiry_type = $3
          AND product_id IS NOT DISTINCT FROM $4
          AND ${NORMALISED_MESSAGE} = lower(regexp_replace(btrim($5), '\\s+', ' ', 'g'))
          AND created_at > now() - make_interval(mins => $6)
        ORDER BY created_at DESC
        LIMIT 1`,
      [input.email, input.phone, input.inquiryType, input.productId, input.message, windowMinutes],
    )
    return rows[0] ? toEnquiry(rows[0]) : null
  },

  async findById(id: string): Promise<Enquiry | null> {
    const db = await getDb()
    const { rows } = await db.query<EnquiryRow>('SELECT * FROM enquiries WHERE id = $1', [id])
    return rows[0] ? toEnquiry(rows[0]) : null
  },

  /** Newest first. */
  async list(filters: EnquiryFilters): Promise<{ enquiries: Enquiry[]; total: number }> {
    const where: string[] = []
    const params: unknown[] = []
    const add = (clause: (placeholder: string) => string, value: unknown) => {
      params.push(value)
      where.push(clause(`$${params.length}`))
    }

    if (filters.status) add((p) => `status = ${p}`, filters.status)
    if (filters.inquiryType) add((p) => `inquiry_type = ${p}`, filters.inquiryType)
    if (filters.source) add((p) => `source = ${p}`, filters.source)
    if (filters.productId) add((p) => `product_id = ${p}`, filters.productId)
    if (filters.hasProduct !== undefined)
      where.push(filters.hasProduct ? 'product_id IS NOT NULL' : 'product_id IS NULL')
    if (filters.synced !== undefined)
      where.push(filters.synced ? 'sheet_synced_at IS NOT NULL' : 'sheet_synced_at IS NULL')
    if (filters.from) add((p) => `created_at >= ${p}`, filters.from)
    if (filters.to) add((p) => `created_at <= ${p}`, filters.to)
    if (filters.search) {
      // Escape LIKE wildcards so the search text is matched literally.
      const term = `%${filters.search.replace(/[\\%_]/g, '\\$&')}%`
      add(
        (p) =>
          `(name ILIKE ${p} OR email ILIKE ${p} OR phone ILIKE ${p} OR message ILIKE ${p} OR product_name ILIKE ${p})`,
        term,
      )
    }

    const condition = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const db = await getDb()

    const { rows } = await db.query<EnquiryRow>(
      `SELECT * FROM enquiries ${condition}
        ORDER BY created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, filters.limit, filters.offset],
    )
    const count = await db.query<{ total: number }>(
      `SELECT COUNT(*)::int AS total FROM enquiries ${condition}`,
      params,
    )

    return { enquiries: rows.map(toEnquiry), total: count.rows[0].total }
  },

  async updateStatus(id: string, status: EnquiryStatus): Promise<Enquiry | null> {
    const db = await getDb()
    const { rows } = await db.query<EnquiryRow>(
      'UPDATE enquiries SET status = $1, updated_at = now() WHERE id = $2 RETURNING *',
      [status, id],
    )
    return rows[0] ? toEnquiry(rows[0]) : null
  },

  /** Headline figures for the admin dashboard. */
  async stats() {
    const db = await getDb()
    const { rows } = await db.query<{
      total: number
      new: number
      contacted: number
      converted: number
      closed: number
      last_7_days: number
      product: number
      unsynced: number
    }>(
      `SELECT COUNT(*)::int                                                    AS total,
              COUNT(*) FILTER (WHERE status = 'new')::int                      AS new,
              COUNT(*) FILTER (WHERE status = 'contacted')::int                AS contacted,
              COUNT(*) FILTER (WHERE status = 'converted')::int                AS converted,
              COUNT(*) FILTER (WHERE status = 'closed')::int                   AS closed,
              COUNT(*) FILTER (WHERE created_at > now() - interval '7 days')::int AS last_7_days,
              COUNT(*) FILTER (WHERE product_id IS NOT NULL)::int              AS product,
              COUNT(*) FILTER (WHERE sheet_synced_at IS NULL)::int             AS unsynced
         FROM enquiries`,
    )
    const r = rows[0]
    return {
      total: r.total,
      byStatus: { new: r.new, contacted: r.contacted, converted: r.converted, closed: r.closed },
      last7Days: r.last_7_days,
      productEnquiries: r.product,
      unsynced: r.unsynced,
    }
  },

  /** Changes the status and/or the internal notes. */
  async update(
    id: string,
    patch: { status?: EnquiryStatus; internalNotes?: string | null },
  ): Promise<Enquiry | null> {
    const sets: string[] = []
    const params: unknown[] = []
    if (patch.status !== undefined) {
      params.push(patch.status)
      sets.push(`status = $${params.length}`)
    }
    if (patch.internalNotes !== undefined) {
      params.push(patch.internalNotes)
      sets.push(`internal_notes = $${params.length}`)
    }
    if (!sets.length) return this.findById(id)

    const db = await getDb()
    const { rows } = await db.query<EnquiryRow>(
      `UPDATE enquiries SET ${sets.join(', ')}, updated_at = now() WHERE id = $${params.length + 1} RETURNING *`,
      [...params, id],
    )
    return rows[0] ? toEnquiry(rows[0]) : null
  },

  async markSheetSynced(id: string): Promise<void> {
    const db = await getDb()
    await db.query(
      `UPDATE enquiries
          SET sheet_synced_at = now(), sheet_sync_attempted_at = now(), sheet_sync_error = NULL
        WHERE id = $1`,
      [id],
    )
  },

  /** Records why a sync attempt failed, so it can be seen and retried later. */
  async recordSheetFailure(id: string, reason: string): Promise<void> {
    const db = await getDb()
    await db.query(
      'UPDATE enquiries SET sheet_sync_attempted_at = now(), sheet_sync_error = $2 WHERE id = $1',
      [id, reason.slice(0, 300)],
    )
  },

  /** Enquiries not yet in Google Sheets, oldest first. */
  async findUnsynced(limit: number): Promise<Enquiry[]> {
    const db = await getDb()
    const { rows } = await db.query<EnquiryRow>(
      'SELECT * FROM enquiries WHERE sheet_synced_at IS NULL ORDER BY created_at LIMIT $1',
      [limit],
    )
    return rows.map(toEnquiry)
  },
}
