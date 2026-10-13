import { ipKeyGenerator, rateLimit } from 'express-rate-limit'
import { env } from '../config/env.ts'
import { getClientIp } from '../utils/clientIp.ts'

const limiter = (windowMinutes: number, limit: number, message: string) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { success: false, message },
    keyGenerator: (req) => ipKeyGenerator(getClientIp(req)),
    // The automated tests send many requests from one address.
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

/** Admin endpoints. */
export const adminLimiter = limiter(15, 300, 'Too many requests. Please try again later.')

/**
 * First line of defence for sign-in and password changes. The stricter, per-account
 * throttle lives in the database (authService) so it also holds across serverless instances.
 */
export const loginLimiter = limiter(15, 20, 'Too many attempts. Please try again later.')
