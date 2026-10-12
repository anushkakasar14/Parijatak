import { createHash, timingSafeEqual } from 'node:crypto'
import type { NextFunction, Request, Response } from 'express'
import { env } from '../config/env.ts'
import { HttpError } from '../utils/httpError.ts'

const digest = (value: string) => createHash('sha256').update(value).digest()

/**
 * Guards admin endpoints with a shared secret sent as `Authorization: Bearer <ADMIN_API_KEY>`.
 * While ADMIN_API_KEY is unset the endpoints stay closed to everyone.
 */
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!env.ADMIN_API_KEY) throw new HttpError(503, 'Admin access is not configured')

  const [scheme, token] = (req.get('authorization') ?? '').split(' ')
  // Hash both sides so the comparison is constant-time regardless of token length.
  const valid =
    scheme === 'Bearer' && !!token && timingSafeEqual(digest(token), digest(env.ADMIN_API_KEY))

  if (!valid) throw new HttpError(401, 'Unauthorized')
  next()
}
