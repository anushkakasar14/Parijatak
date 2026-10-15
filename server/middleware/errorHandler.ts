import type { NextFunction, Request, Response } from 'express'
import { ZodError } from 'zod'
import { HttpError } from '../utils/httpError.ts'
import { logger } from '../utils/logger.ts'

export function notFound(_req: Request, _res: Response, next: NextFunction) {
  next(new HttpError(404, 'Not found'))
}

/** Converts every error into the standard `{ success: false, message }` shape. */
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    const errors: Record<string, string> = {}
    for (const issue of err.issues) {
      const field = issue.path.join('.') || 'body'
      errors[field] ??= issue.message
    }
    res.status(400).json({ success: false, message: 'Please check the details you entered.', errors })
    return
  }

  if (err instanceof HttpError) {
    res.status(err.status).json({ success: false, message: err.message, errors: err.errors })
    return
  }

  // Errors raised by Express's body parser (malformed JSON, oversized body).
  const status = (err as { status?: number }).status
  const type = (err as { type?: string }).type
  if (type === 'entity.parse.failed') {
    res.status(400).json({ success: false, message: 'Request body is not valid JSON.' })
    return
  }
  if (type === 'entity.too.large' || status === 413) {
    res.status(413).json({
      success: false,
      message: req.path.includes('/media') ? 'This file is too large. Images can be up to 4 MB.' : 'Request is too large.',
    })
    return
  }

  // Anything else is unexpected: log the detail server-side, tell the client nothing specific.
  logger.error('Unhandled error', {
    method: req.method,
    path: req.path,
    error: err instanceof Error ? (err.stack ?? err.message) : String(err),
  })
  res.status(500).json({ success: false, message: 'Something went wrong. Please try again later.' })
}
