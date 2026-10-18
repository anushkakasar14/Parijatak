import { Router } from 'express'
import { enquiryController } from '../controllers/enquiryController.ts'
import { sheetsFeedController } from '../controllers/sheetsFeedController.ts'
import { adminLimiter, enquiryLimiter } from '../middleware/rateLimit.ts'
import { requireAdmin, requireRole } from '../middleware/requireAdmin.ts'

export const enquiryRoutes = Router()

// Public
enquiryRoutes.post('/', enquiryLimiter, enquiryController.create)

// Admin — reading is open to any signed-in administrator; changes need the `admin` role.
enquiryRoutes.get('/', adminLimiter, requireAdmin, enquiryController.list)
enquiryRoutes.get('/export.csv', adminLimiter, requireAdmin, enquiryController.exportCsv)
// For a Google Sheet formula; protected by its own secret key instead of a sign-in.
enquiryRoutes.get('/feed.csv', adminLimiter, sheetsFeedController.feed)
enquiryRoutes.post(
  '/sync-sheet',
  adminLimiter,
  requireAdmin,
  requireRole('admin'),
  enquiryController.syncSheet,
)
enquiryRoutes.get('/:id', adminLimiter, requireAdmin, enquiryController.get)
enquiryRoutes.patch(
  '/:id',
  adminLimiter,
  requireAdmin,
  requireRole('admin'),
  enquiryController.updateStatus,
)
