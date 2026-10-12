import { ipKeyGenerator, rateLimit } from 'express-rate-limit'
import { env } from '../config/env.ts'

const limiter = (windowMinutes: number, limit: number, message: string) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { success: false, message },
    // Netlify passes the visitor's address in its own header; elsewhere use Express's req.ip.
    keyGenerator: (req) =>
      ipKeyGenerator(req.get('x-nf-client-connection-ip') ?? req.ip ?? 'unknown'),
    // The automated tests submit many enquiries from one address.
    skip: () => env.isTest,
  })

/** Baseline for every API route. */
export const apiLimiter = limiter(15, 300, 'Too many requests. Please try again later.')

/** Tight limit on enquiry submissions to deter spam. */
export const enquiryLimiter = limiter(
  15,
  5,
  'Too many enquiries from this device. Please try again in a few minutes.',
)

/** Slows down guessing of the admin key. */
export const adminLimiter = limiter(15, 60, 'Too many requests. Please try again later.')
