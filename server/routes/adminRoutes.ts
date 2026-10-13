import { Router } from 'express'
import { adminController } from '../controllers/adminController.ts'
import { adminLimiter } from '../middleware/rateLimit.ts'
import { requireAdmin } from '../middleware/requireAdmin.ts'

/** Admin-only endpoints that are not tied to one resource. Every route here requires sign-in. */
export const adminRoutes = Router()

adminRoutes.use(adminLimiter, requireAdmin)

adminRoutes.get('/overview', adminController.overview)
