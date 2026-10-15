import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, beforeEach, describe, test } from 'node:test'

const WEBHOOK = 'https://script.google.com/macros/s/AKfy-test-deployment_123/exec'
const TOKEN = 'test-token-0123456789abcdefghijklmnop'

Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: 'memory://',
  ADMIN_API_KEY: '',
  GOOGLE_SHEETS_ID: '',
  GOOGLE_SERVICE_ACCOUNT_EMAIL: '',
  GOOGLE_PRIVATE_KEY: '',
  GOOGLE_SHEETS_WEBHOOK_URL: WEBHOOK,
  GOOGLE_SHEETS_WEBHOOK_TOKEN: TOKEN,
})

const { createApp } = await import('../app.ts')
const { closeDb, getDb } = await import('../config/database.ts')
const { authService } = await import('../services/authService.ts')
const { enquiryService } = await import('../services/enquiryService.ts')

// ── A stand-in for the sheet's Apps Script web app ─────────────────────────────────
// Only requests to the web app address are intercepted; the tests' own calls to the
// local server go through untouched.
const sheet = {
  rows: [] as string[][],
  expectedToken: TOKEN,
  behaviour: 'ok' as 'ok' | 'html' | 'no-doPost' | 'down' | 'not-found',
  requests: [] as any[],
}
const realFetch = globalThis.fetch
globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (!url.startsWith('https://script.google.com/')) return realFetch(input, init)

  const request = JSON.parse(String(init?.body))
  sheet.requests.push(request)
  if (sheet.behaviour === 'down') throw new TypeError('fetch failed')
  if (sheet.behaviour === 'html') return new Response('<!doctype html><title>Sign in</title>', { status: 200 })
  if (sheet.behaviour === 'no-doPost')
    return new Response('<html><title>Error</title><div>Script function not found: doPost</div></html>', { status: 200 })
  if (sheet.behaviour === 'not-found') return new Response('<html>Not Found</html>', { status: 404 })

  const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } })
  if (request.token !== sheet.expectedToken) return json({ ok: false, error: 'unauthorized' })
  if (request.action === 'ping') return json({ ok: true, sheetTitle: 'Parijatak Customer Enquiries' })
  if (request.action === 'append') {
    if (sheet.rows.some((r) => r.at(-1) === request.reference)) return json({ ok: true, duplicate: true })
    sheet.rows.push([...request.row, request.reference])
    return json({ ok: true })
  }
  return json({ ok: false, error: 'unknown action' })
}) as typeof fetch

const ADMIN = { email: 'owner@parijatak.test', name: 'Owner', password: 'correct-horse-battery', role: 'admin' as const }
const VIEWER = { email: 'reader@parijatak.test', name: 'Reader', password: 'look-but-do-not-touch', role: 'viewer' as const }

let server: Server
let baseUrl: string
let admin: { cookie: string; csrf: string }
let viewer: { cookie: string; csrf: string }

const sql = async (text: string, params: unknown[] = []) => (await getDb()).query(text, params)

async function call(path: string, { method = 'GET', body, as = null }: { method?: string; body?: unknown; as?: typeof admin | null } = {}) {
  const headers: Record<string, string> = { Origin: baseUrl, 'Content-Type': 'application/json' }
  if (as) {
    headers.Cookie = as.cookie
    headers['X-CSRF-Token'] = as.csrf
  }
  const res = await fetch(`${baseUrl}/api${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const type = res.headers.get('content-type') ?? ''
  return { status: res.status, headers: res.headers, body: type.includes('json') ? ((await res.json()) as any) : await res.text() }
}

async function signIn(account: { email: string; password: string }) {
  const res = await fetch(`${baseUrl}/api/admin/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: baseUrl },
    body: JSON.stringify(account),
  })
  const body = (await res.json()) as any
  return { cookie: (res.headers.get('set-cookie') ?? '').split(';')[0], csrf: body.data.csrfToken }
}

const submit = (overrides: Record<string, unknown> = {}) =>
  call('/enquiries', {
    method: 'POST',
    body: {
      name: 'Asha Rao',
      email: `asha${Math.random().toString(36).slice(2, 8)}@example.com`,
      phone: '+91 98765 43210',
      inquiryType: 'General Enquiry',
      message: 'Do you make table runners?',
      ...overrides,
    },
  })

/** Adds an enquiry directly, received at an exact moment. */
async function enquiryAt(iso: string, overrides: Record<string, string> = {}) {
  const res = await submit(overrides)
  assert.equal(res.status, 201)
  const { rows } = await sql('SELECT id FROM enquiries ORDER BY created_at DESC LIMIT 1')
  await sql('UPDATE enquiries SET created_at = $1 WHERE id = $2', [iso, rows[0].id])
  return rows[0].id as string
}

before(async () => {
  await getDb()
  server = createApp().listen(0)
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  await authService.createAdmin(ADMIN)
  await authService.createAdmin(VIEWER)
})

after(async () => {
  globalThis.fetch = realFetch
  server.close()
  await closeDb()
})

beforeEach(async () => {
  await sql('DELETE FROM enquiries')
  await sql('DELETE FROM admin_sessions')
  sheet.rows = []
  sheet.requests = []
  sheet.expectedToken = TOKEN
  sheet.behaviour = 'ok'
  admin = await signIn(ADMIN)
  viewer = await signIn(VIEWER)
})

describe('follow-up status', () => {
  test('an enquiry can be marked as needing a follow-up, and is counted and filtered', async () => {
    const id = await enquiryAt('2026-03-01T06:00:00Z')
    const updated = await call(`/enquiries/${id}`, { method: 'PATCH', as: admin, body: { status: 'follow_up' } })
    assert.equal(updated.status, 200)
    assert.equal(updated.body.data.status, 'follow_up')

    const overview = await call('/admin/overview', { as: admin })
    assert.equal(overview.body.data.enquiries.byStatus.follow_up, 1)

    const listed = await call('/enquiries?status=follow_up', { as: admin })
    assert.deepEqual(listed.body.data.map((e: any) => e.id), [id])
  })

  test('unknown statuses are still refused', async () => {
    const id = await enquiryAt('2026-03-01T06:00:00Z')
    const res = await call(`/enquiries/${id}`, { method: 'PATCH', as: admin, body: { status: 'maybe' } })
    assert.equal(res.status, 400)
  })
})

describe('internal notes', () => {
  test('staff notes are saved and returned to admins only', async () => {
    const id = await enquiryAt('2026-03-01T06:00:00Z')
    const saved = await call(`/enquiries/${id}`, { method: 'PATCH', as: admin, body: { internalNotes: 'Called on Monday. Wants indigo.' } })
    assert.equal(saved.status, 200)
    assert.equal(saved.body.data.internalNotes, 'Called on Monday. Wants indigo.')

    const asViewer = await call(`/enquiries/${id}`, { method: 'PATCH', as: viewer, body: { internalNotes: 'x' } })
    assert.equal(asViewer.status, 403)
    const read = await call(`/enquiries/${id}`, { as: viewer })
    assert.equal(read.body.data.internalNotes, 'Called on Monday. Wants indigo.')
  })
})

describe('date filter', () => {
  test('days follow India time and include the whole last day', async () => {
    // 23:30 on 31 January in India, and 00:30 on 1 February in India.
    const lateJanuary = await enquiryAt('2026-01-31T18:00:00Z')
    const earlyFebruary = await enquiryAt('2026-01-31T19:00:00Z')
    // 23:59 on 28 February in India.
    const endFebruary = await enquiryAt('2026-02-28T18:29:00Z')

    const feb = await call('/enquiries?from=2026-02-01&to=2026-02-28', { as: admin })
    assert.deepEqual(feb.body.data.map((e: any) => e.id).sort(), [earlyFebruary, endFebruary].sort())

    const jan = await call('/enquiries?to=2026-01-31', { as: admin })
    assert.deepEqual(jan.body.data.map((e: any) => e.id), [lateJanuary])
  })

  test('a backwards or malformed range is refused', async () => {
    assert.equal((await call('/enquiries?from=2026-03-01&to=2026-02-01', { as: admin })).status, 400)
    assert.equal((await call('/enquiries?from=yesterday', { as: admin })).status, 400)
  })
})

describe('CSV export', () => {
  test('requires a signed-in administrator', async () => {
    assert.equal((await call('/enquiries/export.csv')).status, 401)
    assert.equal((await call('/enquiries/export.csv', { as: viewer })).status, 200)
  })

  test('exports the filtered enquiries safely for spreadsheets', async () => {
    const risky = await enquiryAt('2026-04-02T06:00:00Z', {
      name: 'Meera, "Studio" Owner',
      message: '=HYPERLINK("http://evil.example","click")\nsecond line',
    })
    await call(`/enquiries/${risky}`, { method: 'PATCH', as: admin, body: { status: 'follow_up', internalNotes: '@mention me' } })
    await enquiryAt('2026-05-02T06:00:00Z', { name: 'Not In Range' })

    const res = await call('/enquiries/export.csv?from=2026-04-01&to=2026-04-30', { as: admin })
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type') ?? '', /^text\/csv/)
    assert.match(res.headers.get('content-disposition') ?? '', /attachment; filename="parijatak-enquiries-\d{4}-\d{2}-\d{2}\.csv"/)
    assert.equal(res.headers.get('x-total-count'), '1')

    // Decoding as text drops a byte-order mark, so look at the raw bytes for it.
    const raw = Buffer.from(
      await (
        await fetch(`${baseUrl}/api/enquiries/export.csv?from=2026-04-01&to=2026-04-30`, {
          headers: { Cookie: admin.cookie },
        })
      ).arrayBuffer(),
    )
    assert.deepEqual([...raw.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'starts with a byte-order mark so Excel reads UTF-8')

    const text = res.body as string
    assert.ok(text.includes('Received (India time),Name,Email,Contact number'))
    assert.ok(text.includes('2026-04-02 11:30'), 'times are in India time')
    assert.ok(text.includes('"Meera, ""Studio"" Owner"'), 'commas and quotes are escaped')
    assert.ok(text.includes(`"'=HYPERLINK(""http://evil.example"",""click"")\nsecond line"`), 'formulas are neutralised')
    assert.ok(text.includes("'@mention me"))
    assert.ok(text.includes("'+919876543210"), 'phone numbers stay text')
    assert.ok(text.includes('Follow-up required'))
    assert.ok(!text.includes('Not In Range'))
  })
})

describe('Google Sheets through Apps Script', () => {
  test('a new enquiry is added to the sheet with the token and its reference', async () => {
    const res = await submit({ message: 'Please call me about cushions.' })
    assert.equal(res.status, 201)

    assert.equal(sheet.rows.length, 1)
    const [request] = sheet.requests
    assert.equal(request.action, 'append')
    assert.equal(request.token, TOKEN)
    assert.equal(request.row.length, 9)
    assert.equal(request.row[1], 'Asha Rao')
    assert.equal(request.row[6], 'Please call me about cushions.')

    const { rows } = await sql('SELECT id, sheet_synced_at FROM enquiries')
    assert.equal(request.reference, rows[0].id)
    assert.ok(rows[0].sheet_synced_at, 'marked as copied')
  })

  test('a retry never adds the same enquiry twice', async () => {
    await submit()
    await sql('UPDATE enquiries SET sheet_synced_at = NULL')
    const result = await enquiryService.syncPending()
    assert.deepEqual(result, { synced: 1, failed: 0 })
    assert.equal(sheet.rows.length, 1)
  })

  test('when the sheet is unreachable the enquiry is still saved, then sent on retry', async () => {
    sheet.behaviour = 'down'
    const res = await submit()
    assert.equal(res.status, 201)
    const before = await sql('SELECT sheet_synced_at, sheet_sync_error FROM enquiries')
    assert.equal(before.rows[0].sheet_synced_at, null)
    assert.equal(before.rows[0].sheet_sync_error, 'Could not reach Google Apps Script')

    sheet.behaviour = 'ok'
    const retry = await call('/enquiries/sync-sheet', { method: 'POST', as: admin })
    assert.deepEqual(retry.body.data, { synced: 1, failed: 0 })
    assert.equal(sheet.rows.length, 1)
  })

  test('the connection check asks the sheet and reports the real result', async () => {
    const ok = await call('/admin/integrations/google-sheets', { as: viewer })
    assert.equal(ok.status, 200)
    assert.equal(ok.body.data.ok, true)
    assert.equal(ok.body.data.mode, 'apps-script')
    assert.equal(ok.body.data.sheetTitle, 'Parijatak Customer Enquiries')
    assert.equal(sheet.requests.at(-1).action, 'ping')

    sheet.expectedToken = 'a-different-token-set-in-the-script'
    const wrongToken = await call('/admin/integrations/google-sheets', { as: admin })
    assert.equal(wrongToken.body.data.ok, false)
    assert.match(wrongToken.body.data.message, /token/)

    sheet.behaviour = 'html'
    const notPublic = await call('/admin/integrations/google-sheets', { as: admin })
    assert.equal(notPublic.body.data.ok, false)
    assert.match(notPublic.body.data.message, /Who has access: Anyone/)

    sheet.behaviour = 'no-doPost'
    const noDoPost = await call('/admin/integrations/google-sheets', { as: admin })
    assert.equal(noDoPost.body.data.ok, false)
    assert.match(noDoPost.body.data.message, /deploy a new version/)

    sheet.behaviour = 'down'
    const down = await call('/admin/integrations/google-sheets', { as: admin })
    assert.equal(down.body.data.ok, false)

    for (const res of [wrongToken, notPublic, down]) {
      const text = JSON.stringify(res.body)
      assert.ok(!text.includes(TOKEN) && !text.includes('AKfy-test-deployment'), 'never reveals the token or address')
    }
  })

  test('the connection check is for signed-in administrators only', async () => {
    assert.equal((await call('/admin/integrations/google-sheets')).status, 401)
  })
})
