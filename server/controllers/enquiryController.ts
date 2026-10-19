import type { Request, Response } from 'express'
import { z } from 'zod'
import { enquiryModel } from '../models/enquiryModel.ts'
import { enquiryService } from '../services/enquiryService.ts'
import { googleSheetsService } from '../services/googleSheetsService.ts'
import { toCsv } from '../utils/csv.ts'
import { HttpError } from '../utils/httpError.ts'
import { formatIndiaDateTime, indiaDayRange } from '../utils/indiaDate.ts'
import {
  createEnquirySchema,
  listEnquiriesSchema,
  updateEnquirySchema,
} from '../utils/schemas.ts'

const isUuid = (value: string) => z.uuid().safeParse(value).success

/** Most enquiries a single CSV export holds. */
const EXPORT_LIMIT = 5000

export const enquiryStatusLabels: Record<string, string> = {
  new: 'New',
  contacted: 'Contacted',
  follow_up: 'Follow-up required',
  converted: 'Converted',
  closed: 'Closed',
}

/** Filters from the query string, with the date range turned into India-time instants. */
function parseFilters(query: unknown) {
  const { from, to, ...rest } = listEnquiriesSchema.parse(query)
  if (from && to && from > to) {
    throw new HttpError(400, 'Please check the dates.', { to: 'The end date must be on or after the start date' })
  }
  return { ...rest, ...indiaDayRange({ from, to }) }
}

export const enquiryController = {
  /** Public: contact form and product enquiries. */
  async create(req: Request, res: Response) {
    const { contactPreference: trap, ...input } = createEnquirySchema.parse(req.body)
    // Spam is answered exactly like a real enquiry, so the sender learns nothing — but not saved.
    if (trap?.trim()) {
      res.status(201).json({ success: true, message: 'Enquiry submitted successfully' })
      return
    }
    const { duplicate } = await enquiryService.submit(input)
    // Deliberately returns no record data — the public never needs it back.
    // A repeated submission gets the same success message, just without a second record.
    res
      .status(duplicate ? 200 : 201)
      .json({ success: true, message: 'Enquiry submitted successfully' })
  },

  /** Admin only: list with filters and search. */
  async list(req: Request, res: Response) {
    const filters = parseFilters(req.query)
    const { enquiries, total } = await enquiryModel.list(filters)
    res.json({
      success: true,
      data: enquiries,
      pagination: { total, limit: filters.limit, offset: filters.offset },
      // Whether enquiries are pushed to a sheet (and so have a "sent to sheet" state at all).
      meta: { sheetsPush: googleSheetsService.isConfigured() },
    })
  },

  /** Admin only: every enquiry matching the filters, as a spreadsheet file. */
  async exportCsv(req: Request, res: Response) {
    const filters = { ...parseFilters(req.query), limit: EXPORT_LIMIT, offset: 0 }
    const { enquiries, total } = await enquiryModel.list(filters)

    const csv = toCsv(
      ['Received (India time)', 'Name', 'Email', 'Contact number', 'Inquiry type', 'Product', 'Message', 'Status', 'Internal notes', 'Source', 'In Google Sheets', 'Reference'],
      enquiries.map((e) => [
        formatIndiaDateTime(e.createdAt),
        e.name,
        e.email,
        e.phone,
        e.inquiryType,
        e.productName,
        e.message,
        enquiryStatusLabels[e.status] ?? e.status,
        e.internalNotes,
        e.source,
        e.sheetSyncedAt ? 'Yes' : 'No',
        e.id,
      ]),
    )

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
    res.set({
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="parijatak-enquiries-${today}.csv"`,
      'Cache-Control': 'no-store',
      // Lets the admin screen say when a download was cut short.
      'X-Total-Count': String(total),
      'X-Exported-Count': String(enquiries.length),
    })
    res.send(csv)
  },

  /** Admin only. */
  async get(req: Request<{ id: string }>, res: Response) {
    const enquiry = isUuid(req.params.id) ? await enquiryModel.findById(req.params.id) : null
    if (!enquiry) throw new HttpError(404, 'Enquiry not found')
    res.json({ success: true, data: enquiry })
  },

  /** Admin only. */
  async updateStatus(req: Request<{ id: string }>, res: Response) {
    if (!isUuid(req.params.id)) throw new HttpError(404, 'Enquiry not found')

    const patch = updateEnquirySchema.parse(req.body)
    const enquiry = await enquiryModel.update(req.params.id, patch)
    if (!enquiry) throw new HttpError(404, 'Enquiry not found')

    res.json({ success: true, data: enquiry })
  },

  /** Admin only: push enquiries that missed Google Sheets. */
  async syncSheet(_req: Request, res: Response) {
    res.json({ success: true, data: await enquiryService.syncPending() })
  },
}
