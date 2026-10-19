import { randomUUID } from 'node:crypto'
import type { Request, Response } from 'express'
import { z } from 'zod'
import { getPrincipal } from '../middleware/requireAdmin.ts'
import { mediaModel } from '../models/mediaModel.ts'
import type { MediaUpload, StoredMedia } from '../models/mediaModel.ts'
import { getMediaStorage } from '../services/mediaStorage.ts'
import { HttpError } from '../utils/httpError.ts'
import { inspectImage } from '../utils/imageInfo.ts'
import { errorMessage, logger } from '../utils/logger.ts'
import { sanitizeLine } from '../utils/sanitize.ts'
import { inspectVideo } from '../utils/videoInfo.ts'

/** Uploads must fit inside a Netlify function request (6 MB including encoding overhead). */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024

/**
 * Videos are larger than one request allows, so they travel and are stored in pieces of
 * this size, and are played back piece by piece (browsers ask for videos in ranges anyway).
 */
export const VIDEO_CHUNK_BYTES = MAX_UPLOAD_BYTES
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024
/** Uploads left unfinished this long are removed, with their pieces. */
const STALE_UPLOAD_HOURS = 24

const listSchema = z.object({
  search: z
    .string()
    .trim()
    .max(100)
    .optional()
    .transform((v) => v || undefined),
  kind: z.enum(['image', 'video']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(48),
  offset: z.coerce.number().int().min(0).default(0),
})

const altSchema = z.strictObject({
  altText: z.string().transform(sanitizeLine).pipe(z.string().max(200, 'Too long')),
})

const startVideoSchema = z.strictObject({
  filename: z.string().max(300),
  contentType: z.enum(['video/mp4', 'video/webm'], 'Only MP4 and WebM videos can be uploaded.'),
  byteSize: z
    .number()
    .int()
    .positive('This video is empty.')
    .max(MAX_VIDEO_BYTES, `Videos can be up to ${MAX_VIDEO_BYTES / 1024 / 1024} MB.`),
  width: z.number().int().min(1).max(10000).nullable().optional(),
  height: z.number().int().min(1).max(10000).nullable().optional(),
  durationSeconds: z.number().min(0).max(36000).nullable().optional(),
})

const idParam = z.object({ id: z.uuid('Invalid id') })
const uploadParam = z.object({ uploadId: z.uuid('Invalid upload') })
const chunkParam = z.object({
  uploadId: z.uuid('Invalid upload'),
  index: z.coerce.number().int().min(0),
})
const keyParam = z.object({ key: z.string().regex(/^[0-9a-f-]{36}\.(jpg|png|webp|mp4|webm)$/, 'Not found') })

/** A readable, safe version of the uploaded file's name, kept only as a label. */
function cleanFilename(raw: string | undefined, fallback = 'image'): string {
  let name = fallback
  try {
    name = decodeURIComponent(raw ?? '') || name
  } catch {
    // keep the default
  }
  return sanitizeLine(name.replace(/[\\/]/g, ' ')).slice(0, 120) || fallback
}

const chunkKey = (prefix: string, index: number) => `${prefix}/${index}`
const uploadPrefix = (uploadId: string) => `video/${uploadId}`

/** Removes a video's stored pieces. Failures are logged, not thrown: the record is what matters. */
async function deleteChunks(prefix: string, count: number) {
  const storage = getMediaStorage()
  for (let i = 0; i < count; i++) {
    await storage
      .delete(chunkKey(prefix, i))
      .catch((err) => logger.warn('Stored video piece could not be removed', { error: errorMessage(err) }))
  }
}

async function discardUpload(upload: MediaUpload) {
  await deleteChunks(uploadPrefix(upload.id), upload.chunkCount)
  await mediaModel.deleteUpload(upload.id)
}

/** The size the piece at `index` must have. */
const expectedChunkSize = (upload: MediaUpload, index: number) =>
  index < upload.chunkCount - 1 ? upload.chunkSize : upload.byteSize - upload.chunkSize * (upload.chunkCount - 1)

const uploaderId = (res: Response) => {
  const principal = getPrincipal(res)
  return principal.kind === 'session' ? principal.session.user.id : null
}

/** "bytes=0-", "bytes=100-199" or "bytes=-500" → the first and last byte asked for. */
function parseRange(header: string | undefined, size: number): { start: number; end: number } | 'invalid' | null {
  if (!header) return null
  const match = /^bytes=(\d*)-(\d*)/.exec(header)
  if (!match || (match[1] === '' && match[2] === '')) return 'invalid'
  if (match[1] === '') {
    const suffix = Number(match[2])
    if (!suffix) return 'invalid'
    return { start: Math.max(0, size - suffix), end: size - 1 }
  }
  const start = Number(match[1])
  const end = match[2] === '' ? size - 1 : Math.min(Number(match[2]), size - 1)
  if (start >= size || end < start) return 'invalid'
  return { start, end }
}

async function serveVideo(req: Request, res: Response, video: StoredMedia) {
  const size = video.byteSize
  const chunkSize = video.chunkSize ?? VIDEO_CHUNK_BYTES
  const range = parseRange(req.get('range'), size)
  if (range === 'invalid') {
    res.set('Content-Range', `bytes */${size}`)
    return res.status(416).end()
  }

  // One response never crosses into the next stored piece; the browser asks for the rest.
  const start = range?.start ?? 0
  const index = Math.floor(start / chunkSize)
  const pieceStart = index * chunkSize
  const pieceEnd = Math.min(pieceStart + chunkSize, size) - 1
  const end = Math.min(range?.end ?? size - 1, pieceEnd)

  const piece = await getMediaStorage().get(chunkKey(video.storageKey, index))
  if (!piece) {
    res.set('Cache-Control', 'no-store')
    throw new HttpError(404, 'Not found')
  }

  const whole = !range && end === size - 1
  res.status(whole ? 200 : 206).set({
    'Content-Type': video.contentType,
    'Accept-Ranges': 'bytes',
    ...(whole ? {} : { 'Content-Range': `bytes ${start}-${end}/${size}` }),
    // Browsers may keep each range; the CDN must not, since it would store one range under
    // the address and hand it out for every other range.
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Netlify-CDN-Cache-Control': 'no-store',
    'Content-Disposition': 'inline',
    'Content-Security-Policy': "default-src 'none'; media-src 'self'",
  })
  res.send(piece.data.subarray(start - pieceStart, end - pieceStart + 1))
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
        uploadedBy: uploaderId(res),
      })
      res.status(201).json({ success: true, data: asset })
    } catch (err) {
      // Do not leave an orphaned file behind if the record could not be saved.
      await storage.delete(key).catch(() => {})
      throw err
    }
  },

  // ── Videos: start, send pieces, finish ─────────────────────────────────────────

  /** Starts a video upload and says how to cut it into pieces. */
  async startVideo(req: Request, res: Response) {
    // Tidy away uploads abandoned earlier (closed tab, lost connection). Never blocks a new one.
    for (const stale of await mediaModel.staleUploads(STALE_UPLOAD_HOURS).catch(() => [])) {
      await discardUpload(stale).catch(() => {})
    }

    const input = startVideoSchema.parse(req.body)
    const upload = await mediaModel.createUpload({
      filename: cleanFilename(input.filename, 'video'),
      contentType: input.contentType,
      byteSize: input.byteSize,
      chunkSize: VIDEO_CHUNK_BYTES,
      chunkCount: Math.ceil(input.byteSize / VIDEO_CHUNK_BYTES),
      width: input.width ?? null,
      height: input.height ?? null,
      durationSeconds: input.durationSeconds ?? null,
      uploadedBy: uploaderId(res),
    })
    res.status(201).json({
      success: true,
      data: { uploadId: upload.id, chunkSize: upload.chunkSize, chunkCount: upload.chunkCount },
    })
  },

  /** Body: the raw bytes of one piece. Sending a piece again (a retry) replaces it. */
  async putVideoChunk(req: Request, res: Response) {
    const { uploadId, index } = chunkParam.parse(req.params)
    const upload = await mediaModel.findUpload(uploadId)
    if (!upload) throw new HttpError(404, 'This upload was not found. Please start it again.')
    if (index >= upload.chunkCount) throw new HttpError(400, 'This piece does not belong to the upload.')

    const body = req.body
    if (!Buffer.isBuffer(body) || body.length !== expectedChunkSize(upload, index)) {
      throw new HttpError(400, 'This piece arrived incomplete. Please try again.')
    }

    // The first bytes decide whether this really is a playable video.
    if (index === 0) {
      const check = inspectVideo(body)
      if (!check.ok || check.contentType !== upload.contentType) {
        await discardUpload(upload)
        throw new HttpError(415, check.ok ? 'The video does not match its file type.' : check.reason)
      }
    }

    try {
      await getMediaStorage().put(chunkKey(uploadPrefix(uploadId), index), body, upload.contentType)
    } catch (err) {
      logger.error('Video piece failed to store', { error: errorMessage(err) })
      throw new HttpError(502, 'Part of the video could not be stored. Please try again.')
    }
    const updated = await mediaModel.markChunk(uploadId, index)
    res.json({
      success: true,
      data: { received: updated?.receivedChunks.length ?? 0, total: upload.chunkCount },
    })
  },

  /** Every piece has arrived: the video becomes a library item. */
  async completeVideo(req: Request, res: Response) {
    const { uploadId } = uploadParam.parse(req.params)
    const upload = await mediaModel.findUpload(uploadId)
    if (!upload) throw new HttpError(404, 'This upload was not found. Please start it again.')
    const missing = upload.chunkCount - upload.receivedChunks.length
    if (missing > 0) throw new HttpError(409, `${missing} part${missing === 1 ? '' : 's'} of the video did not arrive. Please try again.`)

    const extension = upload.contentType === 'video/webm' ? 'webm' : 'mp4'
    try {
      const asset = await mediaModel.create({
        id: upload.id,
        kind: 'video',
        storageKey: uploadPrefix(upload.id),
        url: `/api/media/${upload.id}.${extension}`,
        filename: upload.filename,
        contentType: upload.contentType,
        byteSize: upload.byteSize,
        width: upload.width,
        height: upload.height,
        durationSeconds: upload.durationSeconds,
        chunkSize: upload.chunkSize,
        chunkCount: upload.chunkCount,
        altText: '',
        uploadedBy: upload.uploadedBy,
      })
      await mediaModel.deleteUpload(upload.id)
      res.status(201).json({ success: true, data: asset })
    } catch (err) {
      // Nothing half-made is left behind: the pieces go if the record cannot be saved.
      await discardUpload(upload).catch(() => {})
      throw err
    }
  },

  /** Cancels an upload in progress and removes the pieces already sent. */
  async abortVideo(req: Request, res: Response) {
    const { uploadId } = uploadParam.parse(req.params)
    const upload = await mediaModel.findUpload(uploadId)
    if (upload) await discardUpload(upload)
    res.json({ success: true, message: 'Upload cancelled' })
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
    if (!asset) throw new HttpError(404, 'File not found')
    res.json({ success: true, data: asset })
  },

  /** Refuses while the file is used anywhere, so no page loses its picture or video. */
  async remove(req: Request, res: Response) {
    const { id } = idParam.parse(req.params)
    const asset = await mediaModel.findById(id)
    if (!asset) throw new HttpError(404, 'File not found')
    const noun = asset.kind === 'video' ? 'video' : 'image'

    const usedIn = await mediaModel.usage(asset.url)
    if (usedIn.length) {
      throw new HttpError(409, `This ${noun} is still used — ${usedIn.slice(0, 3).join('; ')}${usedIn.length > 3 ? '…' : ''}. Replace it there first.`)
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
    if (asset.kind === 'video') {
      await deleteChunks(asset.storageKey, asset.chunkCount ?? 0)
    } else {
      await getMediaStorage()
        .delete(asset.storageKey)
        .catch((err) => logger.warn('Stored file could not be removed', { error: errorMessage(err) }))
    }
    res.json({ success: true, message: `${noun === 'video' ? 'Video' : 'Image'} deleted` })
  },

  /** Public: serves an uploaded image whole, or a video a range at a time. */
  async serve(req: Request, res: Response) {
    const parsed = keyParam.safeParse(req.params)
    if (!parsed.success) throw new HttpError(404, 'Not found')
    const { key } = parsed.data

    if (/\.(mp4|webm)$/.test(key)) {
      const video = await mediaModel.findByUrl(`/api/media/${key}`)
      if (!video || video.kind !== 'video') {
        res.set('Cache-Control', 'no-store')
        throw new HttpError(404, 'Not found')
      }
      return serveVideo(req, res, video)
    }

    const file = await getMediaStorage().get(key)
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
