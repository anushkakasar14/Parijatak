import type { Request, Response } from 'express'
import { z } from 'zod'
import { enquiryModel } from '../models/enquiryModel.ts'
import { enquiryService } from '../services/enquiryService.ts'
import { HttpError } from '../utils/httpError.ts'
import {
  createEnquirySchema,
  listEnquiriesSchema,
  updateEnquirySchema,
} from '../utils/schemas.ts'

const isUuid = (value: string) => z.uuid().safeParse(value).success

export const enquiryController = {
  /** Public: contact form and product enquiries. */
  async create(req: Request, res: Response) {
    const input = createEnquirySchema.parse(req.body)
    const { duplicate } = await enquiryService.submit(input)
    // Deliberately returns no record data — the public never needs it back.
    // A repeated submission gets the same success message, just without a second record.
    res
      .status(duplicate ? 200 : 201)
      .json({ success: true, message: 'Enquiry submitted successfully' })
  },

  /** Admin only: list with filters and search. */
  async list(req: Request, res: Response) {
    const filters = listEnquiriesSchema.parse(req.query)
    const { enquiries, total } = await enquiryModel.list(filters)
    res.json({
      success: true,
      data: enquiries,
      pagination: { total, limit: filters.limit, offset: filters.offset },
    })
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

    const { status } = updateEnquirySchema.parse(req.body)
    const enquiry = await enquiryModel.updateStatus(req.params.id, status)
    if (!enquiry) throw new HttpError(404, 'Enquiry not found')

    res.json({ success: true, data: enquiry })
  },

  /** Admin only: push enquiries that missed Google Sheets. */
  async syncSheet(_req: Request, res: Response) {
    res.json({ success: true, data: await enquiryService.syncPending() })
  },
}
