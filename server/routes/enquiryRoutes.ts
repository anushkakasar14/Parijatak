import { Router } from 'express'
import { enquiryController } from '../controllers/enquiryController.ts'
import { adminLimiter, enquiryLimiter } from '../middleware/rateLimit.ts'
import { requireAdmin } from '../middleware/requireAdmin.ts'

export const enquiryRoutes = Router()

// Public
enquiryRoutes.post('/', enquiryLimiter, enquiryController.create)

// Admin — everything a future dashboard needs: list/filter/search, view, update, re-sync
enquiryRoutes.get('/', adminLimiter, requireAdmin, enquiryController.list)
enquiryRoutes.post('/sync-sheet', adminLimiter, requireAdmin, enquiryController.syncSheet)
enquiryRoutes.get('/:id', adminLimiter, requireAdmin, enquiryController.get)
enquiryRoutes.patch('/:id', adminLimiter, requireAdmin, enquiryController.updateStatus)
