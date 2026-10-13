import { Router } from 'express'
import { authController } from '../controllers/authController.ts'
import { adminLimiter, loginLimiter } from '../middleware/rateLimit.ts'
import { requireAdmin } from '../middleware/requireAdmin.ts'

/**
 * Sign-in and session management for administrators.
 * There is deliberately no registration or self-service reset endpoint: accounts are
 * created and recovered with the provisioning script (see README, "Administrators").
 */
export const adminAuthRoutes = Router()

adminAuthRoutes.post('/login', loginLimiter, authController.login)
adminAuthRoutes.get('/session', adminLimiter, requireAdmin, authController.session)
adminAuthRoutes.post('/logout', adminLimiter, requireAdmin, authController.logout)
adminAuthRoutes.post(
  '/change-password',
  loginLimiter,
  requireAdmin,
  authController.changePassword,
)
