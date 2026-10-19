import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, beforeEach, describe, test } from 'node:test'

const KEY = 'feed-key-0123456789abcdefghijklmnopqrstuv'

Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: 'memory://',
  ADMIN_API_KEY: '',
  GOOGLE_SHEETS_ID: '',
  GOOGLE_SERVICE_ACCOUNT_EMAIL: '',
  GOOGLE_PRIVATE_KEY: '',
  GOOGLE_SHEETS_WEBHOOK_URL: '',
  GOOGLE_SHEETS_WEBHOOK_TOKEN: '',
  GOOGLE_SHEETS_FEED_KEY: KEY,
})

const { createApp } = await import('../app.ts')
const { closeDb, getDb } = await import('../config/database.ts')
const { env } = await import('../config/env.ts')
const { authService } = await import('../services/authService.ts')

const ADMIN = { email: 'owner@parijatak.test', name: 'Owner', password: 'correct-horse-battery', role: 'admin' as const }

let server: Server
let baseUrl: string

const sql = async (text: string, params: unknown[] = []) => (await getDb()).query(text, params)
const feed = (key?: string) => fetch(`${baseUrl}/api/enquiries/feed.csv${key === undefined ? '' : `?key=${encodeURIComponent(key)}`}`)

async function enquiry(at: string, fields: Record<string, string> = {}) {
  const res = await fetch(`${baseUrl}/api/enquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'Asha Rao',
      email: `asha${Math.random().toString(36).slice(2, 8)}@example.com`,
      phone: '+91 98765 43210',
      inquiryType: 'General Enquiry',
      message: 'Do you make table runners?',
      ...fields,
    }),
  })
  assert.equal(res.status, 201)
  const { rows } = await sql('SELECT id FROM enquiries ORDER BY created_at DESC LIMIT 1')
  await sql('UPDATE enquiries SET created_at = $1 WHERE id = $2', [at, (rows[0] as { id: string }).id])
}

async function adminGet(path: string) {
  const login = await fetch(`${baseUrl}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: baseUrl },
    body: JSON.stringify(ADMIN),
  })
  const cookie = (login.headers.get('set-cookie') ?? '').split(';')[0]
  return (await fetch(`${baseUrl}/api${path}`, { headers: { Cookie: cookie } }).then((r) => r.json())) as any
}

before(async () => {
  await getDb()
  server = createApp().listen(0)
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  await authService.createAdmin(ADMIN)
})

after(async () => {
  server.close()
  await closeDb()
})

beforeEach(async () => {
  await sql('DELETE FROM enquiries')
  await sql('DELETE FROM integration_status')
  env.GOOGLE_SHEETS_FEED_KEY = KEY
})

describe('Google Sheets formula feed', () => {
  test('answers "not found" without the right key, or when switched off', async () => {
    assert.equal((await feed()).status, 404)
    assert.equal((await feed('wrong-key')).status, 404)
    assert.equal((await feed(KEY.slice(0, -1))).status, 404)
    env.GOOGLE_SHEETS_FEED_KEY = undefined
    assert.equal((await feed(KEY)).status, 404)
  })

  test('with the key, gives every enquiry oldest first, safe for a spreadsheet', async () => {
    await enquiry('2026-05-02T06:00:00Z', { name: 'Second Person' })
    await enquiry('2026-05-01T06:00:00Z', {
      name: 'Meera, "Studio" Owner',
      message: '=HYPERLINK("http://evil.example","click")',
    })

    const res = await feed(KEY)
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type') ?? '', /^text\/csv/)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow')

    const bytes = Buffer.from(await res.arrayBuffer())
    assert.notDeepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'no byte-order mark for IMPORTDATA')
    const lines = bytes.toString('utf8').trim().split('\r\n')
    assert.equal(lines[0], 'Received (India time),Name,Email,Contact number,Inquiry type,Product,Message,Status,Source,Reference')
    assert.equal(lines.length, 3)
    assert.ok(lines[1].startsWith('1 May 2026 · 11:30 am,"Meera, ""Studio"" Owner"'), 'oldest first, India time, escaped')
    assert.ok(lines[1].includes('" =HYPERLINK(""http://evil.example"",""click"")"'), 'formula kept as plain text')
    assert.ok(lines[1].includes(', +91 98765 43210,'), 'readable phone number; the leading space keeps it as text')
    assert.ok(lines[1].includes(',New,website,'))
    assert.ok(lines[2].startsWith('2 May 2026 · 11:30 am,Second Person'))
  })

  test('the admin overview shows when Google last read the feed — and nothing before it has', async () => {
    const before = await adminGet('/admin/overview')
    assert.equal(before.data.googleSheets.feed.enabled, true)
    assert.equal(before.data.googleSheets.feed.lastSuccessAt, null)

    await enquiry('2026-05-01T06:00:00Z')
    await feed(KEY)
    const after = await adminGet('/admin/overview')
    assert.ok(after.data.googleSheets.feed.lastSuccessAt, 'read time recorded')
    assert.equal(after.data.googleSheets.feed.detail, '1 enquiries')

    // A wrong key is not a read.
    await sql('DELETE FROM integration_status')
    await feed('wrong-key')
    assert.equal((await adminGet('/admin/overview')).data.googleSheets.feed.lastSuccessAt, null)
  })

  test('the enquiry list says no enquiries are pushed to a sheet in this setup', async () => {
    const list = await adminGet('/enquiries')
    assert.equal(list.meta.sheetsPush, false)
  })
})
