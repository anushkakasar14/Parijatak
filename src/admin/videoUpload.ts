import { ApiError, adminFetch, sendBinary, uploadFile } from './api'
import { shrinkImage } from './imageResize'
import type { MediaAsset } from './types'

/** The server's limits, repeated here only to fail fast with a clear message. */
export const MAX_VIDEO_MB = 100
export const VIDEO_TYPES = ['video/mp4', 'video/webm'] as const
type VideoType = (typeof VIDEO_TYPES)[number]

const PIECE_ATTEMPTS = 3

/** A message for a video that will certainly be refused, or null to send it. */
export function videoPrecheck(file: File): string | null {
  const lower = file.name.toLowerCase()
  if (file.type === 'video/quicktime' || lower.endsWith('.mov')) {
    return `“${file.name}” is a QuickTime (.mov) video, which many browsers cannot play. Please convert it to MP4 first.`
  }
  if (!videoType(file)) return `“${file.name}” is not an MP4 or WebM video.`
  if (file.size === 0) return `“${file.name}” is empty.`
  if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
    return `“${file.name}” is ${(file.size / 1024 / 1024).toFixed(0)} MB. Videos can be up to ${MAX_VIDEO_MB} MB.`
  }
  return null
}

function videoType(file: File): VideoType | null {
  if ((VIDEO_TYPES as readonly string[]).includes(file.type)) return file.type as VideoType
  const lower = file.name.toLowerCase()
  if (!file.type && lower.endsWith('.mp4')) return 'video/mp4'
  if (!file.type && lower.endsWith('.webm')) return 'video/webm'
  return null
}

const once = (target: EventTarget, ok: string, timeoutMs = 15000) =>
  new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error('timeout')), timeoutMs)
    target.addEventListener(ok, () => (window.clearTimeout(timer), resolve()), { once: true })
    target.addEventListener('error', () => (window.clearTimeout(timer), reject(new Error('error'))), { once: true })
  })

/**
 * Reads a video's size and length, and draws its opening frame, without loading the whole
 * file: the browser only reads what it needs to show the first frame. If the browser cannot
 * play the video, neither can visitors' browsers, so that is reported instead.
 */
async function inspect(file: File): Promise<{ width: number; height: number; duration: number; poster: File | null }> {
  const url = URL.createObjectURL(file)
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'metadata'
  video.src = url
  try {
    await once(video, 'loadedmetadata')
    const { videoWidth: width, videoHeight: height, duration } = video
    if (!width || !height) throw new Error('no picture')

    let poster: File | null = null
    try {
      video.currentTime = Math.min(0.1, duration / 2)
      await once(video, 'seeked', 8000)
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d')?.drawImage(video, 0, 0, width, height)
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85))
      if (blob) poster = new File([blob], `${file.name.replace(/\.[^.]+$/, '')} – still.jpg`, { type: 'image/jpeg' })
    } catch {
      poster = null // the video is still fine; only the still picture is missing
    }
    return { width, height, duration: Number.isFinite(duration) ? duration : 0, poster }
  } catch {
    throw new ApiError(0, `“${file.name}” could not be played in this browser, so it may not play for visitors either. Please convert it to MP4 (H.264).`)
  } finally {
    video.removeAttribute('src')
    video.load()
    URL.revokeObjectURL(url)
  }
}

export interface VideoUploadProgress {
  stage: 'preparing' | 'still' | 'uploading' | 'finishing'
  /** 0–1 across the whole video. */
  fraction: number
}

/**
 * Uploads a video from the computer: its still picture first, then the video itself in
 * pieces read straight from the file, then asks the server to put it together. A piece
 * that fails is retried; if the upload cannot finish, it is cancelled so nothing
 * half-made remains.
 */
export async function uploadVideo(
  file: File,
  onProgress: (progress: VideoUploadProgress) => void,
): Promise<{ video: MediaAsset; poster: MediaAsset | null }> {
  const refused = videoPrecheck(file)
  if (refused) throw new ApiError(0, refused)
  const contentType = videoType(file)!

  onProgress({ stage: 'preparing', fraction: 0 })
  const details = await inspect(file)

  let poster: MediaAsset | null = null
  if (details.poster) {
    onProgress({ stage: 'still', fraction: 0 })
    try {
      poster = await uploadFile<MediaAsset>('/admin/media', await shrinkImage(details.poster))
    } catch {
      poster = null // a missing still picture is not worth failing the video for
    }
  }

  const { uploadId, chunkSize, chunkCount } = await adminFetch<{ uploadId: string; chunkSize: number; chunkCount: number }>(
    '/admin/media/videos',
    {
      method: 'POST',
      body: {
        filename: file.name,
        contentType,
        byteSize: file.size,
        width: details.width,
        height: details.height,
        durationSeconds: Math.round(details.duration * 100) / 100,
      },
    },
  )

  try {
    for (let index = 0; index < chunkCount; index++) {
      // Only this piece is read from the disk.
      const piece = file.slice(index * chunkSize, Math.min((index + 1) * chunkSize, file.size))
      for (let attempt = 1; ; attempt++) {
        try {
          await sendBinary(
            'PUT',
            `/admin/media/videos/${uploadId}/chunks/${index}`,
            piece,
            { 'Content-Type': 'application/octet-stream' },
            (f) => onProgress({ stage: 'uploading', fraction: (index + f) / chunkCount }),
          )
          break
        } catch (err) {
          // A refusal (wrong type, signed out…) will not change on a retry; a dropped connection may.
          const retryable = err instanceof ApiError && (err.status === 0 || err.status >= 500)
          if (!retryable || attempt >= PIECE_ATTEMPTS) throw err
          await new Promise((resolve) => window.setTimeout(resolve, attempt * 1500))
        }
      }
    }
    onProgress({ stage: 'finishing', fraction: 1 })
    const video = await adminFetch<MediaAsset>(`/admin/media/videos/${uploadId}/complete`, { method: 'POST' })
    return { video, poster }
  } catch (err) {
    await adminFetch(`/admin/media/videos/${uploadId}`, { method: 'DELETE' }).catch(() => {})
    throw err
  }
}

export function formatDuration(seconds: number | null) {
  if (seconds == null) return ''
  const s = Math.round(seconds)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
