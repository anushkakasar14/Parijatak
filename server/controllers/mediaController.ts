import { randomUUID } from 'node:crypto'
import type { Request, Response } from 'express'
import { z } from 'zod'
import { getPrincipal } from '../middleware/requireAdmin.ts'
import { mediaModel } from '../models/mediaModel.ts'
import { getMediaStorage } from '../services/mediaStorage.ts'
import { HttpError } from '../utils/httpError.ts'
import { inspectImage } from '../utils/imageInfo.ts'
import { errorMessage, logger } from '../utils/logger.ts'
import { sanitizeLine } from '../utils/sanitize.ts'

/** Uploads must fit inside a Netlify function request (6 MB including encoding overhead). */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024

const listSchema = z.object({
  search: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => v || undefined),
  limit: z.coerce.number().int().min(1).max(100).default(48),
  offset: z.coerce.number().int().min(0).default(0),
})

const altSchema = z.strictObject({
  altText: z.string().transform(sanitizeLine).pipe(z.string().max(200, 'Too long')),
})

const idParam = z.object({ id: z.uuid('Invalid id') })
const keyParam = z.object({ key: z.string().regex(/^[0-9a-f-]{36}\.(jpg|png|webp)$/, 'Not found') })

/** A readable, safe version of the uploaded file's name, kept only as a label. */
function cleanFilename(raw: string | undefined): string {
  let name = 'image'
  try {
    name = decodeURIComponent(raw ?? '') || name
  } catch {
    // keep the default
  }
  return sanitizeLine(name.replace(/[\\/]/g, ' ')).slice(0, 120) || 'image'
}

export const mediaController = {
  /** Body: the raw file. Headers: Content-Type (ignored for the decision) and X-Filename. */
  async upload(req: Request, res: Response) {
    const body = req.body
    if (!Buffer.isBuffer(body) || body.length === 0) {
      throw new HttpError(400, 'Choose a JPEG, PNG or WebP image to upload.')
    }

    // The bytes decide what the file is, not its name or the type the browser reported.
    const info = inspectImage(body)
    if (!info) throw new HttpError(415, 'Only JPEG, PNG and WebP images can be uploaded.')
    if (info.width && info.height && (info.width > 12000 || info.height > 12000)) {
      throw new HttpError(400, 'This image is too large in pixels. Please use one under 12,000 px wide.')
    }

    const key = `${randomUUID()}.${info.extension}`
    const storage = getMediaStorage()
    try {
      await storage.put(key, body, info.contentType)
    } catch (err) {
      logger.error('Media upload failed to store', { error: errorMessage(err) })
      throw new HttpError(502, 'The image could not be stored. Please try again.')
    }

    const principal = getPrincipal(res)
    try {
      const asset = await mediaModel.create({
        storageKey: key,
        url: `/api/media/${key}`,
        filename: cleanFilename(req.get('x-filename')),
        contentType: info.contentType,
        byteSize: body.length,
        width: info.width,
        height: info.height,
        altText: '',
        uploadedBy: principal.kind === 'session' ? principal.session.user.id : null,
      })
      res.status(201).json({ success: true, data: asset })
    } catch (err) {
      // Do not leave an orphaned file behind if the record could not be saved.
      await storage.delete(key).catch(() => {})
      throw err
    }
  },

  async list(req: Request, res: Response) {
    const filter = listSchema.parse(req.query)
    const { assets, total } = await mediaModel.list(filter)
    res.json({
      success: true,
      data: assets,
      pagination: { total, limit: filter.limit, offset: filter.offset },
    })
  },

  async update(req: Request, res: Response) {
    const { id } = idParam.parse(req.params)
    const { altText } = altSchema.parse(req.body)
    const asset = await mediaModel.updateAlt(id, altText)
    if (!asset) throw new HttpError(404, 'Image not found')
    res.json({ success: true, data: asset })
  },

  /** Refuses while the image is used anywhere, so no page loses its picture. */
  async remove(req: Request, res: Response) {
    const { id } = idParam.parse(req.params)
    const asset = await mediaModel.findById(id)
    if (!asset) throw new HttpError(404, 'Image not found')

    const usedIn = await mediaModel.usage(asset.url)
    if (usedIn.length) {
      throw new HttpError(409, `This image is still used — ${usedIn.slice(0, 3).join('; ')}${usedIn.length > 3 ? '…' : ''}. Replace it there first.`)
    }

    try {
      await mediaModel.delete(id)
    } catch (err) {
      // A product gallery took the image between the check above and this delete.
      // ON DELETE RESTRICT reports 23001; a plain foreign key 23503.
      if (['23001', '23503'].includes((err as { code?: string }).code ?? '')) {
        throw new HttpError(409, 'This image is still used by a product. Replace it there first.')
      }
      throw err
    }
    await getMediaStorage()
      .delete(asset.storageKey)
      .catch((err) => logger.warn('Stored file could not be removed', { error: errorMessage(err) }))
    res.json({ success: true, message: 'Image deleted' })
  },

  /** Public: serves an uploaded image. Addresses are unique per upload, so they can be cached forever. */
  async serve(req: Request, res: Response) {
    const parsed = keyParam.safeParse(req.params)
    if (!parsed.success) throw new HttpError(404, 'Not found')

    const file = await getMediaStorage().get(parsed.data.key)
    if (!file) {
      // A brand-new upload may not have reached every location yet: never cache the miss.
      res.set('Cache-Control', 'no-store')
      throw new HttpError(404, 'Not found')
    }

    res.set({
      'Content-Type': file.contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Netlify-CDN-Cache-Control': 'public, max-age=31536000, immutable, durable',
      'Content-Disposition': 'inline',
      // Images only: nothing in an uploaded file may run as a page.
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'",
    })
    res.send(file.data)
  },
}
