import type { Request, Response } from 'express'
import { z } from 'zod'
import { env } from '../config/env.ts'
import {
  SESSION_COOKIE,
  getPrincipal,
  isSameOrigin,
  sessionCookieOptions,
} from '../middleware/requireAdmin.ts'
import { authService } from '../services/authService.ts'
import { getClientIp } from '../utils/clientIp.ts'
import { HttpError } from '../utils/httpError.ts'
import { PASSWORD_MAX_LENGTH } from '../utils/password.ts'

const loginSchema = z.object({
  email: z
    .string('Email is required')
    .transform((v) => v.trim().toLowerCase())
    .pipe(z.email('Enter a valid email address').max(254)),
  // Upper bound stops very long inputs being fed to the password hash.
  password: z.string('Password is required').min(1, 'Password is required').max(PASSWORD_MAX_LENGTH),
})

const changePasswordSchema = z.object({
  currentPassword: z.string('Current password is required').min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: z.string('New password is required').min(1).max(PASSWORD_MAX_LENGTH),
})

function sessionPayload(res: Response) {
  const principal = getPrincipal(res)
  if (principal.kind !== 'session') throw new HttpError(401, 'Please sign in to continue.')
  const { id, email, name, role } = principal.session.user
  return {
    user: { id, email, name, role },
    csrfToken: principal.csrfToken,
    expiresAt: principal.session.expiresAt,
    idleTimeoutMinutes: env.ADMIN_SESSION_IDLE_MINUTES,
  }
}

export const authController = {
  async login(req: Request, res: Response) {
    res.set('Cache-Control', 'no-store')
    // Stops another site signing a visitor's browser into an account of its choosing.
    if (!isSameOrigin(req)) throw new HttpError(403, 'Request blocked: wrong origin')

    const { email, password } = loginSchema.parse(req.body)
    const signedIn = await authService.login(email, password, {
      ipAddress: getClientIp(req),
      userAgent: req.get('user-agent') ?? null,
    })

    res.cookie(SESSION_COOKIE, signedIn.token, {
      ...sessionCookieOptions(),
      expires: new Date(signedIn.expiresAt),
    })

    const { id, name, role } = signedIn.user
    res.json({
      success: true,
      data: {
        user: { id, email: signedIn.user.email, name, role },
        csrfToken: signedIn.csrfToken,
        expiresAt: signedIn.expiresAt,
        idleTimeoutMinutes: env.ADMIN_SESSION_IDLE_MINUTES,
      },
    })
  },

  /** Who am I? Lets the admin panel restore its state after a page refresh. */
  session(_req: Request, res: Response) {
    res.json({ success: true, data: sessionPayload(res) })
  },

  async logout(_req: Request, res: Response) {
    const principal = getPrincipal(res)
    if (principal.kind === 'session') await authService.logout(principal.session.id)
    res.clearCookie(SESSION_COOKIE, sessionCookieOptions())
    res.json({ success: true, message: 'Signed out' })
  },

  async changePassword(req: Request, res: Response) {
    const principal = getPrincipal(res)
    if (principal.kind !== 'session') throw new HttpError(401, 'Please sign in to continue.')

    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body)
    await authService.changePassword(principal.session, currentPassword, newPassword)
    res.json({ success: true, message: 'Password changed' })
  },
}
