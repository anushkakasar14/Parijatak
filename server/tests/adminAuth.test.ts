import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, beforeEach, describe, test } from 'node:test'

// Configure the environment before any server module is loaded.
const LEGACY_KEY = 'legacy-admin-key-0123456789abcdef'
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: 'memory://',
  ADMIN_API_KEY: LEGACY_KEY,
  ADMIN_SESSION_IDLE_MINUTES: '30',
  ADMIN_SESSION_MAX_HOURS: '12',
  GOOGLE_SHEETS_ID: '',
  GOOGLE_SERVICE_ACCOUNT_EMAIL: '',
  GOOGLE_PRIVATE_KEY: '',
})

const { createApp } = await import('../app.ts')
const { closeDb, getDb } = await import('../config/database.ts')
const { authService } = await import('../services/authService.ts')
const { enquiryModel } = await import('../models/enquiryModel.ts')
const { SESSION_COOKIE, sessionCookieOptions } = await import('../middleware/requireAdmin.ts')
const { checkPasswordPolicy, hashPassword, verifyPassword } = await import('../utils/password.ts')

const ADMIN = { email: 'owner@parijatak.test', name: 'Owner', password: 'correct-horse-battery', role: 'admin' as const }
const VIEWER = { email: 'reader@parijatak.test', name: 'Viewer', password: 'viewer-only-passphrase', role: 'viewer' as const }

let server: Server
let baseUrl: string
let origin: string

const sql = async (text: string, params: unknown[] = []) => (await getDb()).query(text, params)

interface Signed {
  cookie: string
  csrfToken: string
  setCookie: string
}

/** Raw request helper: sends the cookie / CSRF token / Origin exactly as given. */
function call(
  path: string,
  options: { method?: string; body?: unknown; cookie?: string; csrf?: string; origin?: string | null; auth?: string } = {},
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (options.cookie) headers.Cookie = options.cookie
  if (options.csrf) headers['X-CSRF-Token'] = options.csrf
  if (options.auth) headers.Authorization = options.auth
  // Browsers send Origin on state-changing requests; default to the site's own.
  if (options.origin !== null) headers.Origin = options.origin ?? origin
  return fetch(`${baseUrl}/api${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  })
}

async function signIn(account: { email: string; password: string }): Promise<Signed> {
  const res = await call('/admin/auth/login', { method: 'POST', body: account })
  assert.equal(res.status, 200, 'sign-in should succeed')
  const setCookie = res.headers.get('set-cookie') ?? ''
  const body = (await res.json()) as any
  return { cookie: setCookie.split(';')[0], csrfToken: body.data.csrfToken, setCookie }
}

async function seedEnquiry() {
  return enquiryModel.create({
    name: 'Asha Rao',
    email: 'asha@example.com',
    phone: '+919876543210',
    inquiryType: 'General Enquiry',
    message: 'Hello',
    productId: null,
    productName: null,
    source: 'website',
  })
}

before(async () => {
  await getDb()
  server = createApp().listen(0)
  const { port } = server.address() as AddressInfo
  baseUrl = `http://127.0.0.1:${port}`
  origin = baseUrl
})

after(async () => {
  server.close()
  await closeDb()
})

beforeEach(async () => {
  await sql('DELETE FROM admin_login_attempts')
  await sql('DELETE FROM admin_sessions')
  await sql('DELETE FROM admin_users')
  await sql('DELETE FROM enquiries')
  await authService.createAdmin(ADMIN)
  await authService.createAdmin(VIEWER)
})

describe('sign-in', () => {
  test('correct credentials start a session with a hardened cookie', async () => {
    const res = await call('/admin/auth/login', { method: 'POST', body: ADMIN })
    const body = (await res.json()) as any
    const setCookie = res.headers.get('set-cookie') ?? ''

    assert.equal(res.status, 200)
    assert.equal(body.data.user.email, ADMIN.email)
    assert.equal(body.data.user.role, 'admin')
    assert.ok(body.data.csrfToken)
    assert.match(setCookie, new RegExp(`^${SESSION_COOKIE}=`))
    assert.match(setCookie, /HttpOnly/i)
    assert.match(setCookie, /SameSite=Strict/i)
    assert.match(setCookie, /Path=\//)
    assert.equal(res.headers.get('cache-control'), 'no-store')

    // Neither the password hash nor the session token is ever in a response body.
    const text = JSON.stringify(body)
    assert.ok(!text.includes('scrypt'))
    assert.ok(!text.includes(setCookie.split(';')[0].split('=')[1]))
  })

  test('the cookie is marked Secure in production', () => {
    assert.equal(sessionCookieOptions(true).secure, true)
    assert.equal(sessionCookieOptions(true).httpOnly, true)
    assert.equal(sessionCookieOptions(true).sameSite, 'strict')
  })

  test('only a hash of the session token is stored', async () => {
    const { cookie } = await signIn(ADMIN)
    const token = cookie.split('=')[1]
    const { rows } = await sql('SELECT token_hash FROM admin_sessions')
    assert.equal(rows.length, 1)
    assert.notEqual((rows[0] as any).token_hash, token)
  })

  test('wrong password and unknown email get the same answer', async () => {
    const wrong = await call('/admin/auth/login', {
      method: 'POST',
      body: { email: ADMIN.email, password: 'not-the-password' },
    })
    const unknown = await call('/admin/auth/login', {
      method: 'POST',
      body: { email: 'nobody@parijatak.test', password: 'not-the-password' },
    })

    assert.equal(wrong.status, 401)
    assert.equal(unknown.status, 401)
    assert.deepEqual(await wrong.json(), await unknown.json())
    assert.equal(wrong.headers.get('set-cookie'), null)
  })

  test('a deactivated administrator cannot sign in and is signed out', async () => {
    const session = await signIn(ADMIN)
    await authService.setActive(ADMIN.email, false)

    const existing = await call('/enquiries', { cookie: session.cookie })
    const fresh = await call('/admin/auth/login', { method: 'POST', body: ADMIN })

    assert.equal(existing.status, 401)
    assert.equal(fresh.status, 401)
  })

  test('repeated failures lock sign-in, even for the right password', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await call('/admin/auth/login', {
        method: 'POST',
        body: { email: ADMIN.email, password: `wrong-password-${i}` },
      })
      assert.equal(res.status, 401)
    }

    const locked = await call('/admin/auth/login', { method: 'POST', body: ADMIN })
    assert.equal(locked.status, 429)
    assert.equal(locked.headers.get('set-cookie'), null)
  })

  test('a sign-in request from another site is refused', async () => {
    const res = await call('/admin/auth/login', {
      method: 'POST',
      body: ADMIN,
      origin: 'https://evil.example',
    })
    assert.equal(res.status, 403)
    assert.equal(res.headers.get('set-cookie'), null)
  })

  test('there is no public registration endpoint', async () => {
    for (const path of ['/admin/auth/register', '/admin/auth/signup', '/admin/users']) {
      const res = await call(path, { method: 'POST', body: ADMIN })
      assert.ok([401, 404].includes(res.status), `${path} must not create anything`)
    }
    const { rows } = await sql('SELECT COUNT(*)::int AS n FROM admin_users')
    assert.equal((rows[0] as any).n, 2, 'no account was created')
    {
    }
  })
})

describe('sessions', () => {
  test('the session endpoint restores the signed-in state', async () => {
    const { cookie, csrfToken } = await signIn(ADMIN)
    const res = await call('/admin/auth/session', { cookie })
    const body = (await res.json()) as any

    assert.equal(res.status, 200)
    assert.equal(body.data.user.email, ADMIN.email)
    assert.equal(body.data.csrfToken, csrfToken)
  })

  test('requests without a session are refused on every admin route', async () => {
    const enquiry = await seedEnquiry()
    const routes: [string, string][] = [
      ['GET', '/admin/auth/session'],
      ['POST', '/admin/auth/logout'],
      ['POST', '/admin/auth/change-password'],
      ['GET', '/admin/overview'],
      ['GET', '/enquiries'],
      ['GET', `/enquiries/${enquiry.id}`],
      ['PATCH', `/enquiries/${enquiry.id}`],
      ['POST', '/enquiries/sync-sheet'],
    ]
    for (const [method, path] of routes) {
      const res = await call(path, { method, body: method === 'GET' ? undefined : {} })
      assert.equal(res.status, 401, `${method} ${path} must require sign-in`)
    }
  })

  test('a made-up or tampered cookie is refused', async () => {
    const { cookie } = await signIn(ADMIN)
    const tampered = cookie.slice(0, -1) + (cookie.endsWith('A') ? 'B' : 'A')

    for (const value of [`${SESSION_COOKIE}=nonsense`, tampered]) {
      const res = await call('/enquiries', { cookie: value })
      assert.equal(res.status, 401)
    }
  })

  test('an idle session expires', async () => {
    const { cookie } = await signIn(ADMIN)
    await sql(`UPDATE admin_sessions SET last_seen_at = now() - interval '31 minutes'`)

    const res = await call('/enquiries', { cookie })
    assert.equal(res.status, 401)
    assert.match(res.headers.get('set-cookie') ?? '', /Expires=Thu, 01 Jan 1970/, 'stale cookie is cleared')
  })

  test('activity keeps a session alive, but not past its absolute limit', async () => {
    const { cookie } = await signIn(ADMIN)

    // Active two minutes ago: still valid, and the idle clock is reset.
    await sql(`UPDATE admin_sessions SET last_seen_at = now() - interval '2 minutes'`)
    assert.equal((await call('/enquiries', { cookie })).status, 200)
    const { rows } = await sql(
      `SELECT last_seen_at > now() - interval '30 seconds' AS fresh FROM admin_sessions`,
    )
    assert.equal((rows[0] as any).fresh, true)

    // Past the 12-hour limit: refused however recently it was used.
    await sql(`UPDATE admin_sessions SET expires_at = now() - interval '1 minute'`)
    assert.equal((await call('/enquiries', { cookie })).status, 401)
  })

  test('sign-out ends the session on the server, not just in the browser', async () => {
    const { cookie, csrfToken } = await signIn(ADMIN)

    const out = await call('/admin/auth/logout', { method: 'POST', cookie, csrf: csrfToken })
    assert.equal(out.status, 200)
    assert.match(out.headers.get('set-cookie') ?? '', /Expires=Thu, 01 Jan 1970/)

    // Replaying the old cookie no longer works.
    assert.equal((await call('/enquiries', { cookie })).status, 401)
    assert.equal((await sql('SELECT 1 FROM admin_sessions')).rows.length, 0)
  })

  test('changing the password signs out other sessions and replaces the password', async () => {
    const first = await signIn(ADMIN)
    const second = await signIn(ADMIN)
    const newPassword = 'a-brand-new-passphrase'

    const weak = await call('/admin/auth/change-password', {
      method: 'POST',
      cookie: first.cookie,
      csrf: first.csrfToken,
      body: { currentPassword: ADMIN.password, newPassword: 'short' },
    })
    assert.equal(weak.status, 400)

    const wrongCurrent = await call('/admin/auth/change-password', {
      method: 'POST',
      cookie: first.cookie,
      csrf: first.csrfToken,
      body: { currentPassword: 'not-my-password', newPassword },
    })
    assert.equal(wrongCurrent.status, 400)

    const changed = await call('/admin/auth/change-password', {
      method: 'POST',
      cookie: first.cookie,
      csrf: first.csrfToken,
      body: { currentPassword: ADMIN.password, newPassword },
    })
    assert.equal(changed.status, 200)

    assert.equal((await call('/enquiries', { cookie: first.cookie })).status, 200)
    assert.equal((await call('/enquiries', { cookie: second.cookie })).status, 401)

    const oldLogin = await call('/admin/auth/login', { method: 'POST', body: ADMIN })
    assert.equal(oldLogin.status, 401)
    await signIn({ email: ADMIN.email, password: newPassword })
  })

  test('a password reset signs the account out everywhere', async () => {
    const { cookie } = await signIn(ADMIN)
    await authService.resetPassword(ADMIN.email, 'recovered-passphrase-1')

    assert.equal((await call('/enquiries', { cookie })).status, 401)
    await signIn({ email: ADMIN.email, password: 'recovered-passphrase-1' })
  })
})

describe('CSRF protection', () => {
  test('a state-changing request needs the CSRF token', async () => {
    const enquiry = await seedEnquiry()
    const { cookie, csrfToken } = await signIn(ADMIN)
    const patch = (extra: object) =>
      call(`/enquiries/${enquiry.id}`, { method: 'PATCH', cookie, body: { status: 'contacted' }, ...extra })

    assert.equal((await patch({})).status, 403, 'missing token')
    assert.equal((await patch({ csrf: 'wrong-token' })).status, 403, 'wrong token')
    assert.equal((await enquiryModel.findById(enquiry.id))?.status, 'new', 'nothing was changed')

    const ok = await patch({ csrf: csrfToken })
    assert.equal(ok.status, 200)
    assert.equal((await enquiryModel.findById(enquiry.id))?.status, 'contacted')
  })

  test('a token from another session is not accepted', async () => {
    const enquiry = await seedEnquiry()
    const mine = await signIn(ADMIN)
    const other = await signIn(ADMIN)

    const res = await call(`/enquiries/${enquiry.id}`, {
      method: 'PATCH',
      cookie: mine.cookie,
      csrf: other.csrfToken,
      body: { status: 'closed' },
    })
    assert.equal(res.status, 403)
  })

  test('a request started by another site is refused even with a valid token', async () => {
    const enquiry = await seedEnquiry()
    const { cookie, csrfToken } = await signIn(ADMIN)

    const res = await call(`/enquiries/${enquiry.id}`, {
      method: 'PATCH',
      cookie,
      csrf: csrfToken,
      origin: 'https://evil.example',
      body: { status: 'closed' },
    })
    assert.equal(res.status, 403)
    assert.equal((await enquiryModel.findById(enquiry.id))?.status, 'new')
  })

  test('reading does not need the token', async () => {
    const { cookie } = await signIn(ADMIN)
    assert.equal((await call('/enquiries', { cookie })).status, 200)
  })

  test('cross-site callers get no CORS permission to send cookies', async () => {
    const res = await call('/enquiries', { origin: 'https://evil.example' })
    assert.equal(res.headers.get('access-control-allow-origin'), null)
    assert.equal(res.headers.get('access-control-allow-credentials'), null)
  })
})

describe('authorization', () => {
  test('a viewer can read enquiries but cannot change anything', async () => {
    const enquiry = await seedEnquiry()
    const { cookie, csrfToken } = await signIn(VIEWER)

    assert.equal((await call('/enquiries', { cookie })).status, 200)
    assert.equal((await call(`/enquiries/${enquiry.id}`, { cookie })).status, 200)

    const patch = await call(`/enquiries/${enquiry.id}`, {
      method: 'PATCH',
      cookie,
      csrf: csrfToken,
      body: { status: 'closed' },
    })
    const sync = await call('/enquiries/sync-sheet', { method: 'POST', cookie, csrf: csrfToken })

    assert.equal(patch.status, 403)
    assert.equal(sync.status, 403)
    assert.equal((await enquiryModel.findById(enquiry.id))?.status, 'new')
  })

  test('the legacy API key still works for existing scripts and is flagged as deprecated', async () => {
    const enquiry = await seedEnquiry()
    const auth = `Bearer ${LEGACY_KEY}`

    const list = await call('/enquiries', { auth, origin: null })
    assert.equal(list.status, 200)
    assert.equal(list.headers.get('deprecation'), 'true')

    const patch = await call(`/enquiries/${enquiry.id}`, {
      method: 'PATCH',
      auth,
      origin: null,
      body: { status: 'contacted' },
    })
    assert.equal(patch.status, 200)

    const wrong = await call('/enquiries', { auth: 'Bearer wrong-key', origin: null })
    assert.equal(wrong.status, 401)
  })

  test('the legacy key cannot be used to act as a signed-in administrator', async () => {
    const res = await call('/admin/auth/session', { auth: `Bearer ${LEGACY_KEY}`, origin: null })
    assert.equal(res.status, 401)
  })

  test('the public enquiry form still works without signing in', async () => {
    const res = await call('/enquiries', {
      method: 'POST',
      body: {
        name: 'Meera',
        email: 'meera@example.com',
        phone: '9123456780',
        inquiryType: 'General Enquiry',
        message: 'Do you ship to Pune?',
      },
    })
    assert.equal(res.status, 201)
  })
})

describe('passwords', () => {
  test('hashes are salted, verifiable and not reversible to the same value', async () => {
    const a = await hashPassword(ADMIN.password)
    const b = await hashPassword(ADMIN.password)

    assert.notEqual(a, b)
    assert.ok(!a.includes(ADMIN.password))
    assert.equal(await verifyPassword(ADMIN.password, a), true)
    assert.equal(await verifyPassword('something-else', a), false)
  })

  test('weak passwords are rejected by the policy', () => {
    assert.ok(checkPasswordPolicy('short', ADMIN.email))
    assert.ok(checkPasswordPolicy('password1234', ADMIN.email))
    assert.ok(checkPasswordPolicy('aaaaaaaaaaaaaa', ADMIN.email))
    assert.ok(checkPasswordPolicy('owner-is-my-name', ADMIN.email))
    assert.equal(checkPasswordPolicy('correct-horse-battery', ADMIN.email), null)
  })
})

describe('dashboard overview', () => {
  test('reports enquiry figures, sync backlog and recent enquiries', async () => {
    const first = await seedEnquiry()
    await seedEnquiry()
    await enquiryModel.updateStatus(first.id, 'contacted')
    await enquiryModel.markSheetSynced(first.id)

    const { cookie } = await signIn(VIEWER)
    const res = await call('/admin/overview', { cookie })
    const { data } = (await res.json()) as any

    assert.equal(res.status, 200)
    assert.equal(res.headers.get('cache-control'), 'no-store')
    assert.equal(data.enquiries.total, 2)
    assert.deepEqual(data.enquiries.byStatus, { new: 1, contacted: 1, converted: 0, closed: 0 })
    assert.equal(data.enquiries.last7Days, 2)
    assert.equal(data.googleSheets.pending, 1)
    assert.equal(data.googleSheets.configured, false)
    assert.equal(data.products.total, 3)
    assert.equal(data.recentEnquiries.length, 2)
  })

  test('the enquiry list can be narrowed to those still waiting for Google Sheets', async () => {
    const synced = await seedEnquiry()
    await seedEnquiry()
    await enquiryModel.markSheetSynced(synced.id)

    const { cookie } = await signIn(ADMIN)
    const waiting = (await (await call('/enquiries?synced=false', { cookie })).json()) as any
    const done = (await (await call('/enquiries?synced=true', { cookie })).json()) as any

    assert.equal(waiting.pagination.total, 1)
    assert.equal(done.pagination.total, 1)
    assert.equal(done.data[0].id, synced.id)
  })
})
