import { randomUUID } from 'node:crypto'
import { db } from '../config/database.ts'
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
  created_at: string
  updated_at: string
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export type NewEnquiry = Pick<
  Enquiry,
  'name' | 'email' | 'phone' | 'inquiryType' | 'message' | 'productId' | 'productName' | 'source'
>

export const enquiryModel = {
  create(input: NewEnquiry): Enquiry {
    const now = new Date().toISOString()
    const enquiry: Enquiry = {
      ...input,
      id: randomUUID(),
      status: 'new',
      createdAt: now,
      updatedAt: now,
    }

    db.prepare(
      `INSERT INTO enquiries
         (id, name, email, phone, inquiry_type, message, product_id, product_name, source, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      enquiry.id,
      enquiry.name,
      enquiry.email,
      enquiry.phone,
      enquiry.inquiryType,
      enquiry.message,
      enquiry.productId,
      enquiry.productName,
      enquiry.source,
      enquiry.status,
      enquiry.createdAt,
      enquiry.updatedAt,
    )

    return enquiry
  },

  findById(id: string): Enquiry | null {
    const row = db.prepare('SELECT * FROM enquiries WHERE id = ?').get(id) as unknown as
      | EnquiryRow
      | undefined
    return row ? toEnquiry(row) : null
  },

  /** Newest first. */
  list(options: { status?: EnquiryStatus; limit: number; offset: number }) {
    const where = options.status ? 'WHERE status = ?' : ''
    const params = options.status ? [options.status] : []

    const rows = db
      .prepare(`SELECT * FROM enquiries ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .all(...params, options.limit, options.offset) as unknown as EnquiryRow[]
    const { total } = db
      .prepare(`SELECT COUNT(*) AS total FROM enquiries ${where}`)
      .get(...params) as { total: number }

    return { enquiries: rows.map(toEnquiry), total }
  },

  updateStatus(id: string, status: EnquiryStatus): Enquiry | null {
    const result = db
      .prepare('UPDATE enquiries SET status = ?, updated_at = ? WHERE id = ?')
      .run(status, new Date().toISOString(), id)
    return result.changes ? this.findById(id) : null
  },
}
