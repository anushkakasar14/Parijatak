import { Router } from 'express'
import { enquiryController } from '../controllers/enquiryController.ts'
import { adminLimiter, enquiryLimiter } from '../middleware/rateLimit.ts'
import { requireAdmin } from '../middleware/requireAdmin.ts'

export const enquiryRoutes = Router()

// Public
enquiryRoutes.post('/', enquiryLimiter, enquiryController.create)

// Admin
enquiryRoutes.get('/', adminLimiter, requireAdmin, enquiryController.list)
enquiryRoutes.patch('/:id', adminLimiter, requireAdmin, enquiryController.updateStatus)
