import assert from 'node:assert/strict'
import type { Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { after, before, beforeEach, describe, mock, test } from 'node:test'

// Configure the environment before any server module is loaded.
const ADMIN_KEY = 'test-admin-key-0123456789abcdef'
Object.assign(process.env, {
  NODE_ENV: 'test',
  DATABASE_URL: 'memory://',
  ADMIN_API_KEY: ADMIN_KEY,
  GOOGLE_SHEETS_ID: '',
  GOOGLE_SERVICE_ACCOUNT_EMAIL: '',
  GOOGLE_PRIVATE_KEY: '',
})

const { createApp } = await import('../app.ts')
const { closeDb, getDb } = await import('../config/database.ts')
const { enquiryModel } = await import('../models/enquiryModel.ts')
const { googleSheetsService } = await import('../services/googleSheetsService.ts')

let server: Server
let baseUrl: string

const validEnquiry = {
  name: 'Asha Rao',
  email: 'asha@example.com',
  phone: '+91 98765 43210',
  inquiryType: 'Product Enquiry',
  message: 'I would like to know more about your throws.',
  productId: 'throws',
}

const post = (body: unknown) =>
  fetch(`${baseUrl}/api/enquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

const admin = (path: string, init: RequestInit = {}) =>
  fetch(`${baseUrl}/api/enquiries${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${ADMIN_KEY}`, 'Content-Type': 'application/json' },
  })

const countEnquiries = async () => {
  const { rows } = await (await getDb()).query<{ n: number }>(
    'SELECT COUNT(*)::int AS n FROM enquiries',
  )
  return rows[0].n
}

/** Makes the Sheets service look configured and replaces the real network call. */
function stubSheets(implementation: (enquiry: { id: string }) => Promise<void>) {
  mock.method(googleSheetsService, 'isConfigured', () => true)
  return mock.method(googleSheetsService, 'addEnquiryToGoogleSheet', implementation)
}

before(async () => {
  await getDb()
  server = createApp().listen(0)
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

after(async () => {
  server.close()
  await closeDb()
})

beforeEach(async () => {
  mock.restoreAll()
  await (await getDb()).query('DELETE FROM enquiries')
})

describe('POST /api/enquiries', () => {
  test('valid enquiry is stored, sent to Google Sheets, and reported as successful', async () => {
    const sheets = stubSheets(async () => {})

    const res = await post(validEnquiry)

    assert.equal(res.status, 201)
    assert.deepEqual(await res.json() as any, {
      success: true,
      message: 'Enquiry submitted successfully',
    })

    const { enquiries } = await enquiryModel.list({ limit: 10, offset: 0 })
    assert.equal(enquiries.length, 1)
    const saved = enquiries[0]
    assert.equal(saved.name, 'Asha Rao')
    assert.equal(saved.phone, '+919876543210')
    assert.equal(saved.productName, 'Throws')
    assert.equal(saved.source, 'website')
    assert.equal(saved.status, 'new')
    assert.ok(saved.sheetSyncedAt, 'enquiry should be marked as synced to the sheet')

    assert.equal(sheets.mock.callCount(), 1)
    assert.equal(sheets.mock.calls[0].arguments[0].id, saved.id)
  })

  test('a submission that fills in the hidden spam trap looks successful but is not kept', async () => {
    const sheets = stubSheets(async () => {})

    const res = await post({ ...validEnquiry, contactPreference: 'http://spam.example' })

    assert.equal(res.status, 201)
    assert.equal(((await res.json()) as any).success, true)
    assert.equal(await countEnquiries(), 0)
    assert.equal(sheets.mock.callCount(), 0)

    // An empty trap (every real visitor) is an ordinary enquiry.
    assert.equal((await post({ ...validEnquiry, contactPreference: '' })).status, 201)
    assert.equal(await countEnquiries(), 1)
  })

  test('invalid email is rejected', async () => {
    const res = await post({ ...validEnquiry, email: 'not-an-email' })
    const body = await res.json() as any

    assert.equal(res.status, 400)
    assert.equal(body.success, false)
    assert.ok(body.errors.email)
    assert.equal(await countEnquiries(), 0)
  })

  test('invalid phone is rejected', async () => {
    const res = await post({ ...validEnquiry, phone: '12345' })
    const body = await res.json() as any

    assert.equal(res.status, 400)
    assert.ok(body.errors.phone)
    assert.equal(await countEnquiries(), 0)
  })

  test('missing name is rejected', async () => {
    const { name: _name, ...withoutName } = validEnquiry
    const res = await post(withoutName)
    const body = await res.json() as any

    assert.equal(res.status, 400)
    assert.ok(body.errors.name)
    assert.equal(await countEnquiries(), 0)
  })

  test('missing inquiry type is rejected', async () => {
    const { inquiryType: _type, ...withoutType } = validEnquiry
    const res = await post(withoutType)
    const body = await res.json() as any

    assert.equal(res.status, 400)
    assert.ok(body.errors.inquiryType)
    assert.equal(await countEnquiries(), 0)
  })

  test('database failure returns a generic error and never reaches Google Sheets', async () => {
    const sheets = stubSheets(async () => {})
    mock.method(enquiryModel, 'create', async () => {
      throw new Error('connection refused: postgresql://user:secret@db.internal/parijatak')
    })

    const res = await post(validEnquiry)
    const text = await res.text()

    assert.equal(res.status, 500)
    assert.deepEqual(JSON.parse(text), {
      success: false,
      message: 'Something went wrong. Please try again later.',
    })
    assert.ok(!text.includes('secret'), 'database details must not leak to the client')
    assert.equal(sheets.mock.callCount(), 0)
  })

  test('Google Sheets failure still saves the enquiry and returns success', async () => {
    stubSheets(async () => {
      throw new Error('Sheets API unavailable')
    })

    const res = await post(validEnquiry)

    assert.equal(res.status, 201)
    assert.equal((await res.json() as any).success, true)

    const { enquiries } = await enquiryModel.list({ limit: 10, offset: 0 })
    assert.equal(enquiries.length, 1, 'the enquiry must remain in the database')
    assert.equal(enquiries[0].sheetSyncedAt, null, 'it stays flagged for a later re-sync')
  })

  test('an enquiry that missed Google Sheets is picked up by the re-sync', async () => {
    stubSheets(async () => {
      throw new Error('Sheets API unavailable')
    })
    await post(validEnquiry)

    mock.restoreAll()
    const sheets = stubSheets(async () => {})
    const res = await admin('/sync-sheet', { method: 'POST' })

    assert.deepEqual((await res.json() as any).data, { synced: 1, failed: 0 })
    assert.equal(sheets.mock.callCount(), 1)
    assert.equal((await enquiryModel.findUnsynced(10)).length, 0)
  })

  test('duplicate submission is accepted once and not stored or sent twice', async () => {
    const sheets = stubSheets(async () => {})

    const first = await post(validEnquiry)
    // Same enquiry again, differing only in letter case and spacing.
    const second = await post({
      ...validEnquiry,
      email: 'ASHA@example.com',
      phone: '9876543210',
      message: '  I would like to know more   about your THROWS. ',
    })

    assert.equal(first.status, 201)
    assert.equal(second.status, 200)
    assert.equal((await second.json() as any).success, true)
    assert.equal(await countEnquiries(), 1)
    assert.equal(sheets.mock.callCount(), 1)
  })

  test('simultaneous identical submissions create a single enquiry', async () => {
    const responses = await Promise.all([post(validEnquiry), post(validEnquiry), post(validEnquiry)])

    assert.ok(responses.every((r) => r.ok))
    assert.equal(await countEnquiries(), 1)
  })

  test('a different message from the same person is a new, legitimate enquiry', async () => {
    await post(validEnquiry)
    const res = await post({ ...validEnquiry, message: 'Also, do you make custom sizes?' })

    assert.equal(res.status, 201)
    assert.equal(await countEnquiries(), 2)
  })
})

describe('admin enquiry endpoints', () => {
  test('require the admin key', async () => {
    const res = await fetch(`${baseUrl}/api/enquiries`)
    assert.equal(res.status, 401)
  })

  test('filter, search and status update', async () => {
    await post(validEnquiry)
    await post({
      ...validEnquiry,
      name: 'Meera Joshi',
      email: 'meera@example.com',
      phone: '9123456780',
      inquiryType: 'Collaboration',
      message: 'We run a boutique hotel and would like to collaborate.',
      productId: undefined,
    })

    const all = await (await admin('')).json() as any
    assert.equal(all.pagination.total, 2)

    const productOnly = await (await admin('?hasProduct=true')).json() as any
    assert.deepEqual(
      productOnly.data.map((e: { name: string }) => e.name),
      ['Asha Rao'],
    )

    const byType = await (await admin('?inquiryType=Collaboration')).json() as any
    assert.equal(byType.data[0].name, 'Meera Joshi')

    const searched = await (await admin('?search=boutique')).json() as any
    assert.equal(searched.pagination.total, 1)

    // A search containing LIKE wildcards is matched literally, not as a pattern.
    const wildcard = await (await admin('?search=%25')).json() as any
    assert.equal(wildcard.pagination.total, 0)

    const id = searched.data[0].id
    const updated = await admin(`/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'contacted' }),
    })
    assert.equal((await updated.json() as any).data.status, 'contacted')

    const contacted = await (await admin('?status=contacted')).json() as any
    assert.equal(contacted.pagination.total, 1)

    const single = await (await admin(`/${id}`)).json() as any
    assert.equal(single.data.email, 'meera@example.com')
  })
})
