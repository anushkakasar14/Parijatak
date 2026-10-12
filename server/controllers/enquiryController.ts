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

export const enquiryController = {
  /** Public: contact form and product enquiries. */
  async create(req: Request, res: Response) {
    const input = createEnquirySchema.parse(req.body)
    await enquiryService.submit(input)
    // Deliberately returns no record data — the public never needs it back.
    res.status(201).json({ success: true, message: 'Enquiry submitted successfully' })
  },

  /** Admin only. */
  list(req: Request, res: Response) {
    const { status, limit, offset } = listEnquiriesSchema.parse(req.query)
    const { enquiries, total } = enquiryModel.list({ status, limit, offset })
    res.json({ success: true, data: enquiries, pagination: { total, limit, offset } })
  },

  /** Admin only. */
  updateStatus(req: Request<{ id: string }>, res: Response) {
    if (!z.uuid().safeParse(req.params.id).success) throw new HttpError(404, 'Enquiry not found')

    const { status } = updateEnquirySchema.parse(req.body)
    const enquiry = enquiryModel.updateStatus(req.params.id, status)
    if (!enquiry) throw new HttpError(404, 'Enquiry not found')

    res.json({ success: true, data: enquiry })
  },
}
