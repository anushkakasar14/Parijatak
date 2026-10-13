import { createHash, timingSafeEqual } from 'node:crypto'
import type { CookieOptions, NextFunction, Request, Response } from 'express'
import { env } from '../config/env.ts'
import type { AdminSession } from '../models/adminSessionModel.ts'
import type { AdminRole } from '../models/adminUserModel.ts'
import { authService, csrfTokenFor } from '../services/authService.ts'
import { HttpError } from '../utils/httpError.ts'
import { logger } from '../utils/logger.ts'

/**
 * Session cookie. In production the `__Host-` prefix makes browsers refuse the cookie
 * unless it is Secure, host-only and scoped to "/", so a sub-domain cannot overwrite it.
 */
export const SESSION_COOKIE = env.isProduction ? '__Host-parijatak_admin' : 'parijatak_admin'

export function sessionCookieOptions(isProduction = env.isProduction): CookieOptions {
  return {
    httpOnly: true, // not readable from JavaScript
    secure: isProduction, // HTTPS only in production
    sameSite: 'strict', // never sent on requests started by another site
    path: '/',
  }
}

/** Who is making an admin request. */
export type AdminPrincipal =
  | { kind: 'session'; role: AdminRole; session: AdminSession; csrfToken: string }
  | { kind: 'legacy-key'; role: 'admin' }

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const digest = (value: string) => createHash('sha256').update(value).digest()
const safeEqual = (a: string, b: string) => timingSafeEqual(digest(a), digest(b))

function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const index = part.indexOf('=')
    if (index > 0 && part.slice(0, index).trim() === name) return part.slice(index + 1).trim()
  }
  return undefined
}

/**
 * True unless the browser says the request was started by a different site.
 * Browsers attach Origin to every state-changing fetch; tools such as curl send none.
 */
export function isSameOrigin(req: Request): boolean {
  const origin = req.get('origin')
  if (!origin) return true
  if (env.corsOrigins.includes(origin)) return true
  try {
    const { host } = new URL(origin)
    return host === req.get('host') || host === req.get('x-forwarded-host')
  } catch {
    return false
  }
}

let legacyKeyWarned = false

function legacyKeyPrincipal(req: Request, res: Response): AdminPrincipal | null {
  if (!env.ADMIN_API_KEY) return null
  const [scheme, token] = (req.get('authorization') ?? '').split(' ')
  if (scheme !== 'Bearer' || !token || !safeEqual(token, env.ADMIN_API_KEY)) return null

  res.set('Deprecation', 'true')
  if (!legacyKeyWarned) {
    legacyKeyWarned = true
    logger.warn('Legacy ADMIN_API_KEY was used; remove the variable once it is no longer needed')
  }
  return { kind: 'legacy-key', role: 'admin' }
}

/**
 * Authenticates every admin request on the server:
 *  1. a valid session cookie (administrators signing in through the admin panel), or
 *  2. the legacy `Authorization: Bearer <ADMIN_API_KEY>` header (existing scripts).
 *
 * Session requests that change data must also come from this site and carry the
 * session's CSRF token in the X-CSRF-Token header.
 */
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  // Admin responses must never be stored by browsers or shared caches.
  res.set('Cache-Control', 'no-store')

  const token = readCookie(req, SESSION_COOKIE)
  const session = token ? await authService.authenticate(token) : null

  if (token && session) {
    if (!SAFE_METHODS.has(req.method)) {
      if (!isSameOrigin(req)) throw new HttpError(403, 'Request blocked: wrong origin')
      const sent = req.get('x-csrf-token')
      if (!sent || !safeEqual(sent, csrfTokenFor(token))) {
        throw new HttpError(403, 'Your session could not be verified. Please reload the page.')
      }
    }
    res.locals.admin = {
      kind: 'session',
      role: session.user.role,
      session,
      csrfToken: csrfTokenFor(token),
    } satisfies AdminPrincipal
    return next()
  }

  // A cookie that no longer maps to a session is stale: tell the browser to drop it.
  if (token) res.clearCookie(SESSION_COOKIE, sessionCookieOptions())

  const legacy = legacyKeyPrincipal(req, res)
  if (legacy) {
    res.locals.admin = legacy
    return next()
  }

  throw new HttpError(401, 'Please sign in to continue.')
}

/** Use after `requireAdmin` on routes that change data. */
export function requireRole(...roles: AdminRole[]) {
  return (_req: Request, res: Response, next: NextFunction) => {
    const principal = res.locals.admin as AdminPrincipal | undefined
    if (!principal) throw new HttpError(401, 'Please sign in to continue.')
    if (!roles.includes(principal.role)) {
      throw new HttpError(403, 'You do not have permission to do this.')
    }
    next()
  }
}

export function getPrincipal(res: Response): AdminPrincipal {
  return res.locals.admin as AdminPrincipal
}
