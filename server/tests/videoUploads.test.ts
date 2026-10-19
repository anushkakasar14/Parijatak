import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, beforeEach, describe, test } from 'node:test'

Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: 'memory://',
  ADMIN_API_KEY: '',
  GOOGLE_SHEETS_ID: '',
  GOOGLE_SERVICE_ACCOUNT_EMAIL: '',
  GOOGLE_PRIVATE_KEY: '',
  GOOGLE_SHEETS_WEBHOOK_URL: '',
  GOOGLE_SHEETS_WEBHOOK_TOKEN: '',
  GOOGLE_SHEETS_FEED_KEY: '',
})

const { createApp } = await import('../app.ts')
const { closeDb, getDb } = await import('../config/database.ts')
const { authService } = await import('../services/authService.ts')
const { getMediaStorage } = await import('../services/mediaStorage.ts')
const { VIDEO_CHUNK_BYTES, MAX_VIDEO_BYTES } = await import('../controllers/mediaController.ts')

const ADMIN = { email: 'owner@parijatak.test', name: 'Owner', password: 'correct-horse-battery', role: 'admin' as const }
const VIEWER = { email: 'reader@parijatak.test', name: 'Reader', password: 'look-but-do-not-touch', role: 'viewer' as const }

let server: Server
let baseUrl: string
let admin: { cookie: string; csrf: string }
let viewer: { cookie: string; csrf: string }

const sql = async (text: string, params: unknown[] = []) => (await getDb()).query(text, params)

async function signIn(account: { email: string; password: string }) {
  const res = await fetch(`${baseUrl}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: baseUrl },
    body: JSON.stringify(account),
  })
  const body = (await res.json()) as any
  return { cookie: (res.headers.get('set-cookie') ?? '').split(';')[0], csrf: body.data.csrfToken }
}

async function call(path: string, init: { method?: string; body?: unknown; raw?: Buffer; as?: typeof admin | null; headers?: Record<string, string> } = {}) {
  const as = init.as === undefined ? admin : init.as
  const headers: Record<string, string> = { Origin: baseUrl, ...init.headers }
  if (!init.raw) headers['Content-Type'] = 'application/json'
  if (as) {
    headers.Cookie = as.cookie
    headers['X-CSRF-Token'] = as.csrf
  }
  const res = await fetch(`${baseUrl}/api${path}`, {
    method: init.method ?? 'GET',
    headers,
    body: init.raw ?? (init.body === undefined ? undefined : JSON.stringify(init.body)),
  })
  const type = res.headers.get('content-type') ?? ''
  return { status: res.status, headers: res.headers, body: type.includes('json') ? ((await res.json()) as any) : Buffer.from(await res.arrayBuffer()) }
}

/** A fake but correctly headed MP4 of `size` bytes, filled with a recognisable pattern. */
function mp4(size: number) {
  const b = Buffer.alloc(size)
  for (let i = 0; i < size; i++) b[i] = i % 251
  b.writeUInt32BE(24, 0)
  b.write('ftypisom', 4, 'latin1')
  return b
}
function webm(size: number) {
  const b = Buffer.alloc(size, 7)
  b.writeUInt32BE(0x1a45dfa3, 0)
  b.write('\x42\x82\x84webm', 8, 'latin1')
  return b
}

/** Uploads a whole video the way the admin page does: start, every piece, finish. */
async function uploadVideo(file: Buffer, contentType = 'video/mp4', filename = 'loom film.mp4') {
  const start = await call('/admin/media/videos', {
    method: 'POST',
    body: { filename, contentType, byteSize: file.length, width: 1280, height: 720, durationSeconds: 10 },
  })
  assert.equal(start.status, 201, JSON.stringify(start.body))
  const { uploadId, chunkSize, chunkCount } = start.body.data
  for (let i = 0; i < chunkCount; i++) {
    const piece = await call(`/admin/media/videos/${uploadId}/chunks/${i}`, {
      method: 'PUT',
      raw: file.subarray(i * chunkSize, (i + 1) * chunkSize),
      headers: { 'Content-Type': 'application/octet-stream' },
    })
    if (piece.status !== 200) return { uploadId, failed: piece }
  }
  const done = await call(`/admin/media/videos/${uploadId}/complete`, { method: 'POST' })
  return { uploadId, done }
}

before(async () => {
  await getDb()
  server = createApp().listen(0)
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  await authService.createAdmin(ADMIN)
  await authService.createAdmin(VIEWER)
})

after(async () => {
  server.close()
  await closeDb()
})

beforeEach(async () => {
  await sql('DELETE FROM homepage_slides WHERE heading LIKE \'Test%\'')
  await sql("DELETE FROM media_assets WHERE kind = 'video'")
  await sql('DELETE FROM media_uploads')
  await sql('DELETE FROM admin_sessions')
  admin = await signIn(ADMIN)
  viewer = await signIn(VIEWER)
})

describe('video upload in pieces', () => {
  test('a 9 MB video uploads in three pieces and becomes a library item', async () => {
    const file = mp4(2 * VIDEO_CHUNK_BYTES + 123_456)
    const { done } = await uploadVideo(file)
    assert.equal(done!.status, 201)
    const video = done!.body.data
    assert.equal(video.kind, 'video')
    assert.equal(video.contentType, 'video/mp4')
    assert.equal(video.byteSize, file.length)
    assert.match(video.url, /^\/api\/media\/[0-9a-f-]{36}\.mp4$/)
    assert.deepEqual([video.width, video.height, video.durationSeconds], [1280, 720, 10])
    assert.equal(video.filename, 'loom film.mp4')

    const library = await call('/admin/media?kind=video')
    assert.deepEqual(library.body.data.map((v: any) => v.id), [video.id])
    assert.equal((await call('/admin/media?kind=image')).body.data.some((v: any) => v.id === video.id), false)
    // The upload record is gone once finished.
    assert.equal((await sql('SELECT COUNT(*)::int AS n FROM media_uploads')).rows[0].n, 0)
  })

  test('WebM is accepted too', async () => {
    const { done } = await uploadVideo(webm(1000), 'video/webm', 'clip.webm')
    assert.equal(done!.status, 201)
    assert.match(done!.body.data.url, /\.webm$/)
  })

  test('a file that is not really a video is refused, and nothing is kept', async () => {
    const fake = Buffer.alloc(5000, 65) // "AAAA…" named .mp4
    const { failed, uploadId } = await uploadVideo(fake)
    assert.equal(failed!.status, 415)
    assert.match(failed!.body.message, /MP4 and WebM/)
    assert.equal((await call(`/admin/media/videos/${uploadId}/complete`, { method: 'POST' })).status, 404)
    assert.equal(await getMediaStorage().get(`video/${uploadId}/0`), null)
  })

  test('iPhone .mov (QuickTime) videos get a clear message', async () => {
    const mov = mp4(4000)
    mov.write('qt  ', 8, 'latin1')
    const { failed } = await uploadVideo(mov)
    assert.equal(failed!.status, 415)
    assert.match(failed!.body.message, /QuickTime.*MP4/)
  })

  test('too large, empty, or unsupported types are refused before anything is sent', async () => {
    const big = await call('/admin/media/videos', { method: 'POST', body: { filename: 'x.mp4', contentType: 'video/mp4', byteSize: MAX_VIDEO_BYTES + 1 } })
    assert.equal(big.status, 400)
    assert.match(JSON.stringify(big.body), /100 MB/)
    const empty = await call('/admin/media/videos', { method: 'POST', body: { filename: 'x.mp4', contentType: 'video/mp4', byteSize: 0 } })
    assert.equal(empty.status, 400)
    const avi = await call('/admin/media/videos', { method: 'POST', body: { filename: 'x.avi', contentType: 'video/x-msvideo', byteSize: 10 } })
    assert.equal(avi.status, 400)
  })

  test('a piece of the wrong size or number is refused', async () => {
    const start = await call('/admin/media/videos', { method: 'POST', body: { filename: 'x.mp4', contentType: 'video/mp4', byteSize: 5000 } })
    const { uploadId } = start.body.data
    const short = await call(`/admin/media/videos/${uploadId}/chunks/0`, { method: 'PUT', raw: mp4(4000), headers: { 'Content-Type': 'application/octet-stream' } })
    assert.equal(short.status, 400)
    const beyond = await call(`/admin/media/videos/${uploadId}/chunks/1`, { method: 'PUT', raw: mp4(5000), headers: { 'Content-Type': 'application/octet-stream' } })
    assert.equal(beyond.status, 400)
  })

  test('finishing with a piece missing is refused; a retried piece is harmless', async () => {
    const file = mp4(VIDEO_CHUNK_BYTES + 10)
    const start = await call('/admin/media/videos', { method: 'POST', body: { filename: 'x.mp4', contentType: 'video/mp4', byteSize: file.length } })
    const { uploadId } = start.body.data
    const send = (i: number) =>
      call(`/admin/media/videos/${uploadId}/chunks/${i}`, { method: 'PUT', raw: file.subarray(i * VIDEO_CHUNK_BYTES, (i + 1) * VIDEO_CHUNK_BYTES), headers: { 'Content-Type': 'application/octet-stream' } })
    await send(0)
    await send(0) // the same piece again, as after a dropped connection
    const early = await call(`/admin/media/videos/${uploadId}/complete`, { method: 'POST' })
    assert.equal(early.status, 409)
    assert.match(early.body.message, /1 part/)
    assert.deepEqual((await send(1)).body.data, { received: 2, total: 2 })
    assert.equal((await call(`/admin/media/videos/${uploadId}/complete`, { method: 'POST' })).status, 201)
  })

  test('a cancelled upload removes the pieces already sent', async () => {
    const file = mp4(VIDEO_CHUNK_BYTES + 10)
    const start = await call('/admin/media/videos', { method: 'POST', body: { filename: 'x.mp4', contentType: 'video/mp4', byteSize: file.length } })
    const { uploadId } = start.body.data
    await call(`/admin/media/videos/${uploadId}/chunks/0`, { method: 'PUT', raw: file.subarray(0, VIDEO_CHUNK_BYTES), headers: { 'Content-Type': 'application/octet-stream' } })
    assert.ok(await getMediaStorage().get(`video/${uploadId}/0`))
    assert.equal((await call(`/admin/media/videos/${uploadId}`, { method: 'DELETE' })).status, 200)
    assert.equal(await getMediaStorage().get(`video/${uploadId}/0`), null)
    assert.equal((await sql('SELECT COUNT(*)::int AS n FROM media_uploads')).rows[0].n, 0)
  })

  test('uploads abandoned for a day are cleaned up when the next one starts', async () => {
    const start = await call('/admin/media/videos', { method: 'POST', body: { filename: 'x.mp4', contentType: 'video/mp4', byteSize: 5000 } })
    const { uploadId } = start.body.data
    await call(`/admin/media/videos/${uploadId}/chunks/0`, { method: 'PUT', raw: mp4(5000), headers: { 'Content-Type': 'application/octet-stream' } })
    await sql(`UPDATE media_uploads SET created_at = now() - interval '25 hours' WHERE id = $1`, [uploadId])
    await call('/admin/media/videos', { method: 'POST', body: { filename: 'y.mp4', contentType: 'video/mp4', byteSize: 5000 } })
    assert.equal(await getMediaStorage().get(`video/${uploadId}/0`), null)
    assert.equal((await sql('SELECT COUNT(*)::int AS n FROM media_uploads WHERE id = $1', [uploadId])).rows[0].n, 0)
  })
})

describe('video playback in ranges', () => {
  test('ranges return exactly the bytes asked for, never crossing a stored piece', async () => {
    const file = mp4(2 * VIDEO_CHUNK_BYTES + 5000)
    const { done } = await uploadVideo(file)
    const url = done!.body.data.url
    const get = (range?: string) => call(url.replace('/api', ''), { as: null, headers: range ? { Range: range } : {} })

    const first = await get('bytes=0-99')
    assert.equal(first.status, 206)
    assert.equal(first.headers.get('content-range'), `bytes 0-99/${file.length}`)
    assert.equal(first.headers.get('content-type'), 'video/mp4')
    assert.equal(first.headers.get('accept-ranges'), 'bytes')
    assert.deepEqual(first.body, file.subarray(0, 100))

    // Open-ended: the reply stops at the end of the first piece; the browser asks for more.
    const open = await get('bytes=0-')
    assert.equal(open.headers.get('content-range'), `bytes 0-${VIDEO_CHUNK_BYTES - 1}/${file.length}`)
    assert.equal(open.body.length, VIDEO_CHUNK_BYTES)

    // Across the boundary between pieces 1 and 2: cut at the boundary.
    const across = await get(`bytes=${VIDEO_CHUNK_BYTES - 10}-${VIDEO_CHUNK_BYTES + 10}`)
    assert.equal(across.headers.get('content-range'), `bytes ${VIDEO_CHUNK_BYTES - 10}-${VIDEO_CHUNK_BYTES - 1}/${file.length}`)
    assert.deepEqual(across.body, file.subarray(VIDEO_CHUNK_BYTES - 10, VIDEO_CHUNK_BYTES))

    // Inside the last piece, and the last bytes ("bytes=-N").
    const inLast = await get(`bytes=${2 * VIDEO_CHUNK_BYTES + 100}-${2 * VIDEO_CHUNK_BYTES + 199}`)
    assert.deepEqual(inLast.body, file.subarray(2 * VIDEO_CHUNK_BYTES + 100, 2 * VIDEO_CHUNK_BYTES + 200))
    const tail = await get('bytes=-50')
    assert.deepEqual(tail.body, file.subarray(file.length - 50))

    // Beyond the end.
    const outside = await get(`bytes=${file.length + 10}-`)
    assert.equal(outside.status, 416)
    assert.equal(outside.headers.get('content-range'), `bytes */${file.length}`)

    // The CDN must never cache a range under the bare address.
    assert.equal(first.headers.get('netlify-cdn-cache-control'), 'no-store')
  })

  test('a small video without a range request comes back whole', async () => {
    const file = mp4(3000)
    const { done } = await uploadVideo(file)
    const res = await call(done!.body.data.url.replace('/api', ''), { as: null })
    assert.equal(res.status, 200)
    assert.deepEqual(res.body, file)
  })

  test('unknown or malformed video addresses are not found', async () => {
    assert.equal((await call('/media/00000000-0000-0000-0000-000000000000.mp4', { as: null })).status, 404)
    assert.equal((await call('/media/not-a-video.mp4', { as: null })).status, 404)
    assert.equal((await call('/media/00000000-0000-0000-0000-000000000000.mov', { as: null })).status, 404)
  })
})

describe('using and deleting videos', () => {
  test('a video used by a carousel slide cannot be deleted; once unused it is, with all its pieces', async () => {
    const file = mp4(VIDEO_CHUNK_BYTES + 10)
    const { done } = await uploadVideo(file)
    const video = done!.body.data

    const slide = await call('/admin/slides', {
      method: 'POST',
      body: { mediaType: 'video', mediaUrl: video.url, heading: 'Test video slide', status: 'published' },
    })
    assert.equal(slide.status, 201)
    const homepage = (await call('/homepage', { as: null })).body.data
    assert.ok(homepage.slides.some((s: any) => s.mediaUrl === video.url), 'the website shows the uploaded video')

    const blocked = await call(`/admin/media/${video.id}`, { method: 'DELETE' })
    assert.equal(blocked.status, 409)
    assert.match(blocked.body.message, /video is still used.*Test video slide/)

    await call(`/admin/slides/${slide.body.data.id}`, { method: 'DELETE' })
    assert.equal((await call(`/admin/media/${video.id}`, { method: 'DELETE' })).status, 200)
    assert.equal(await getMediaStorage().get(`video/${video.id}/0`), null)
    assert.equal(await getMediaStorage().get(`video/${video.id}/1`), null)
    assert.equal((await call(video.url.replace('/api', ''), { as: null, headers: { Range: 'bytes=0-9' } })).status, 404)
  })
})

describe('who may upload videos', () => {
  test('signed-out visitors, view-only accounts and requests without the security token are refused', async () => {
    const body = { filename: 'x.mp4', contentType: 'video/mp4', byteSize: 5000 }
    assert.equal((await call('/admin/media/videos', { method: 'POST', body, as: null })).status, 401)
    assert.equal((await call('/admin/media/videos', { method: 'POST', body, as: viewer })).status, 403)
    const noToken = await fetch(`${baseUrl}/api/admin/media/videos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: baseUrl, Cookie: admin.cookie },
      body: JSON.stringify(body),
    })
    assert.equal(noToken.status, 403)

    const start = await call('/admin/media/videos', { method: 'POST', body })
    const piece = await call(`/admin/media/videos/${start.body.data.uploadId}/chunks/0`, {
      method: 'PUT',
      raw: mp4(5000),
      as: viewer,
      headers: { 'Content-Type': 'application/octet-stream' },
    })
    assert.equal(piece.status, 403)
    assert.equal((await sql('SELECT COUNT(*)::int AS n FROM media_assets WHERE kind = $1', ['video'])).rows[0].n, 0)
  })
})
