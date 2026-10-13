# Parijatak — Handcrafted Home Textiles

Website and API for Parijatak Home Textile Studio.

- **Frontend** (`/src`) — React, Vite, TypeScript, Tailwind CSS.
- **Backend** (`/server`) — Node.js, Express, PostgreSQL. Stores enquiries and products, and copies each enquiry to a Google Sheet.
- **Hosting** — Netlify serves the site and runs the API as a function (`/netlify/functions/api.ts`).

## Contents

- [How an enquiry flows](#how-an-enquiry-flows)
- [Local development](#local-development)
- [Environment variables](#environment-variables)
- [Database setup](#database-setup)
- [Google Cloud and Google Sheets setup](#google-cloud-and-google-sheets-setup)
- [Production deployment (Netlify)](#production-deployment-netlify)
- [Administrators](#administrators)
- [API](#api)
- [Tests](#tests)
- [Security](#security)
- [Project structure](#project-structure)

## How an enquiry flows

```
Contact form
   ↓  POST /api/enquiries
Validation and sanitization
   ↓
Duplicate check
   ↓
Database (saved and committed)
   ↓
Google Sheets (new row)
   ↓
Success response
```

The database is the source of truth. The enquiry is committed **before** Google Sheets is contacted, so if Sheets is slow, down or misconfigured:

- the enquiry stays in the database,
- the visitor still sees the success message,
- the failure is logged with the enquiry's id (never its contents), and
- the row stays flagged as "not synced", so it can be pushed later with [`POST /api/enquiries/sync-sheet`](#post-apienquiriessync-sheet).

**Duplicate protection.** If the same person (same email and phone) sends the same inquiry type, product and message again within 10 minutes, it is treated as an accidental double submit: they get the same success message, but no second record or sheet row is created. Letter case and spacing differences are ignored. Any change to the message, type or product makes it a new enquiry, and so does the same message after 10 minutes.

## Local development

Requires **Node.js 24 or newer**. Nothing else needs installing — with `DATABASE_URL` empty, the API uses a Postgres database embedded in the Node process and stored in `./data/pglite`.

```bash
npm install
```

```bash
cp .env.example .env
```

Run the API and the website in two terminals:

```bash
npm run server
```

```bash
npm run dev
```

The site is at `http://localhost:5173` and the API at `http://localhost:4000`. Vite forwards `/api/*` to the API, so the contact form works straight away.

| Script | What it does |
| --- | --- |
| `npm run dev` | Frontend dev server |
| `npm run server` | API with auto-restart on file changes |
| `npm start` | API as a standalone server (also serves the built site from `dist/`) |
| `npm run build` | Type-check and build the frontend into `dist/` |
| `npm test` | Run the API tests |
| `npm run typecheck:server` | Type-check the server |

## Environment variables

Set these in `.env` locally and in **Netlify → Site configuration → Environment variables** in production. **Never commit `.env`** — it is in `.gitignore`. None of these values are ever sent to the browser.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `NODE_ENV` | in production | `development` | Set to `production` when deployed |
| `DATABASE_URL` | in production | — | PostgreSQL connection string, `postgresql://user:password@host/db?sslmode=require`. Empty in development means the embedded database |
| `GOOGLE_SHEETS_ID` | for Sheets | — | The spreadsheet's ID (from its URL) |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | for Sheets | — | Service account's `client_email` |
| `GOOGLE_PRIVATE_KEY` | for Sheets | — | Service account's `private_key` |
| `GOOGLE_SHEETS_TAB` | no | first tab | Name of the tab to write to |
| `ADMIN_SESSION_IDLE_MINUTES` | no | `30` | Minutes of inactivity before an admin is signed out |
| `ADMIN_SESSION_MAX_HOURS` | no | `12` | Maximum length of an admin session |
| `ADMIN_API_KEY` | no | — | Legacy shared key for scripts (see [Legacy API key](#legacy-api-key)). Minimum 24 characters. Leave unset to disable |
| `CORS_ORIGINS` | if the API is on another domain | `http://localhost:5173` | Comma-separated origins allowed to call the API. Not needed when site and API share a domain, as on Netlify |
| `TRUST_PROXY` | standalone server only | `0` | Number of reverse proxies in front of the server |
| `PORT` | no | `4000` | Port for the standalone server |
| `WHATSAPP_NUMBER` | no | `917385087502` | Digits only, with country code |

Frontend only: `VITE_API_URL` is needed **only if** the API is hosted on a different domain from the site. Nothing secret may ever go in a `VITE_` variable — those are shipped to the browser.

Generate an admin key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Database setup

Production uses **PostgreSQL**. Any provider works; [Neon](https://neon.tech) has a free tier and suits Netlify well.

1. Create a Postgres database with your provider.
2. Copy its connection string. On Neon, use the **pooled** connection string (the host contains `-pooler`) — it is designed for serverless functions.
3. Set it as `DATABASE_URL` in Netlify (see [deployment](#production-deployment-netlify)).

That is all. The tables and indexes are created automatically the first time the API connects, and the three launch products are inserted if they are missing. There are no migration commands to run.

**`enquiries`**

| Field | Notes |
| --- | --- |
| `id` | UUID |
| `name`, `email`, `phone` | Phone is normalised to `+91XXXXXXXXXX`; email is lower-cased |
| `inquiryType` | One of the six types listed under [POST /api/enquiries](#post-apienquiries) |
| `message` | |
| `productId`, `productName` | Set when the enquiry is about a product, otherwise `null` |
| `source` | `website` \| `whatsapp` \| `other` |
| `status` | `new` \| `contacted` \| `converted` \| `closed` |
| `createdAt`, `updatedAt` | Timestamps (UTC) |
| `sheetSyncedAt` | When the row reached Google Sheets; `null` until then |

**`products`** — `id`, `name`, `slug`, `category`, `description`, `material`, `price`, `imageUrl`, `additionalImages`, `customizationAvailable`, `isFeatured`, `isActive`, `createdAt`, `updatedAt`. Inactive products are never returned by the API.

**Backups.** Enquiries live in this database, so turn on your provider's automatic backups.

## Google Cloud and Google Sheets setup

Optional. Leave the three `GOOGLE_*` variables empty and the API simply skips the sheet.

### 1. Google Cloud project and Sheets API

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create a project (or pick an existing one).
2. Go to **APIs & Services → Library**, find **Google Sheets API** and click **Enable**.

### 2. Service account

1. Go to **APIs & Services → Credentials → Create credentials → Service account**. Give it any name; no roles are needed.
2. Open the new service account → **Keys → Add key → Create new key → JSON**. A JSON file downloads.
3. Keep that file private. Do **not** put it in this project folder, the frontend, `public/`, or GitHub.

### 3. The sheet

1. Create a Google Sheet named **Parijatak Customer Enquiries**.
2. Click **Share** and add the service account's email address (the `client_email` in the JSON file) as an **Editor**.
3. You do not need to type the headings — the API writes this header row the first time it adds an enquiry to an empty sheet:

   | A | B | C | D | E | F | G | H | I |
   | --- | --- | --- | --- | --- | --- | --- | --- | --- |
   | Date | Name | Email | Contact Number | Inquiry Type | Product | Message | Source | Status |

   Dates are written in India Standard Time, e.g. `2026-10-12 15:42`.

### 4. Environment variables

- `GOOGLE_SHEETS_ID` — the long ID in the sheet's URL: `docs.google.com/spreadsheets/d/<THIS PART>/edit`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` — `client_email` from the JSON file
- `GOOGLE_PRIVATE_KEY` — `private_key` from the JSON file, including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines. Paste it exactly as it appears in the JSON, with its `\n` sequences. In a local `.env` file, wrap it in double quotes on one line:

  ```
  GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
  ```

### 5. Check it

Open `/api/health` — it should report `"googleSheets": "configured"`. Submit a test enquiry and look for the new row.

If no row appears, check the function log for `Google Sheets sync failed`; the message says why. The usual causes are the sheet not being shared with the service account, or the Sheets API not being enabled. Once fixed, call `POST /api/enquiries/sync-sheet` to push everything that was missed.

Note: a later status change (`PATCH /api/enquiries/:id`) is **not** copied to the sheet. Each enquiry is written once, when it is created.

## Production deployment (Netlify)

The repository is already set up for Netlify through `netlify.toml`: every push to `main` builds the site and deploys the API as a function at `/api/*`.

1. **Database** — create the Postgres database ([Database setup](#database-setup)).
2. **Google** — create the service account and sheet ([Google setup](#google-cloud-and-google-sheets-setup)).
3. **Environment variables** — in Netlify, go to **Site configuration → Environment variables** and add:

   | Variable | Value |
   | --- | --- |
   | `NODE_ENV` | `production` |
   | `DATABASE_URL` | your Postgres connection string |
   | `GOOGLE_SHEETS_ID` | the sheet's ID |
   | `GOOGLE_SERVICE_ACCOUNT_EMAIL` | the service account email |
   | `GOOGLE_PRIVATE_KEY` | the private key |

4. **Redeploy** — **Deploys → Trigger deploy → Deploy site**. Environment variable changes only take effect after a new deploy.
5. **Verify** — open `https://your-site/api/health`. A healthy setup returns:

   ```json
   { "success": true, "data": { "status": "ok", "database": "ok", "googleSheets": "configured" } }
   ```

   Then submit the contact form and confirm the enquiry appears in the sheet.

Function logs are under **Logs → Functions → api** in Netlify.

**Rate limiting on Netlify.** Limits are counted in the memory of each running function instance. Netlify may run several instances and restarts them when idle, so the limits are a deterrent rather than a strict guarantee. Duplicate protection is enforced in the database and is not affected.

**Other hosts.** The same code runs as an ordinary Node server with `npm start` (Node 24+) on any host. Set `TRUST_PROXY=1` behind a platform proxy, and `CORS_ORIGINS` if the site is on a different domain.

## Administrators

The admin panel lives at `/admin`. Administrators sign in with an email and password; there is **no public registration** and no way to create an account over the API.

### What the admin panel contains

| Section | Status |
| --- | --- |
| Overview | Enquiry counts by status, last 7 days, latest enquiries, Google Sheets sync status with a retry button |
| Enquiries | List with search, filters (status, type, product/general, sheet status), paging, full details, and status changes |
| Products | View-only list of published products |
| Homepage carousel, Offers & banners, Homepage & About, Contact & social | Not built yet — each page says so. They need the content-management backend |
| Account | Who is signed in, and change password |

The panel adapts to phones: the sidebar becomes a slide-in menu and the enquiry table becomes a list of cards. A `viewer` account sees everything but gets no controls that change data; the server refuses such requests regardless.

### How sign-in is secured

- **Sessions are kept on the server**, in the `admin_sessions` table. The browser holds only a random token in a cookie that is `HttpOnly` (JavaScript cannot read it), `Secure` in production, `SameSite=Strict`, and named with the `__Host-` prefix. The database stores only a hash of the token.
- **Nothing privileged is in the frontend** — no keys in React code, `VITE_` variables, `localStorage`, `sessionStorage` or the bundle.
- **CSRF protection**: every request that changes data must come from this site (Origin check) and carry the session's CSRF token in the `X-CSRF-Token` header. The token is derived from the session token and held in memory only.
- **Expiry**: a session ends after `ADMIN_SESSION_IDLE_MINUTES` of inactivity (default 30) and, however active, `ADMIN_SESSION_MAX_HOURS` after sign-in (default 12). Sign-out deletes the session on the server.
- **Sign-in throttling** is stored in the database, so it holds across Netlify function instances: 5 failed attempts per address and account in 15 minutes, 20 per address, 30 per account.
- **Passwords** are hashed with scrypt (N=2^15, r=8, p=3) and must be at least 12 characters. Wrong password, unknown email and deactivated account all return the same message.
- **Roles**: `admin` can change things; `viewer` can only read. Roles are enforced on the server for every route.

### Creating the first administrator

Run this on a trusted computer with `DATABASE_URL` set to the database you want to change (for production, put the production connection string in your local `.env` first):

```bash
npm run admin -- create --email you@example.com --name "Your Name"
```

You are asked to type the password twice; it is not shown. Add `--generate` to have a strong password created and displayed once instead, or `--role viewer` for a read-only account.

With `DATABASE_URL` empty the command changes only the local development database — the first line of its output says which database it is using. Stop `npm run server` before running it locally, because the embedded development database allows one program at a time.

### Other account commands

| Command | What it does |
| --- | --- |
| `npm run admin -- list` | Shows every administrator, their role and last sign-in |
| `npm run admin -- reset-password --email …` | **Password recovery.** Sets a new password and signs that account out everywhere |
| `npm run admin -- deactivate --email …` | Blocks sign-in and ends the account's sessions immediately |
| `npm run admin -- activate --email …` | Re-enables a deactivated account |

Password recovery is deliberately a command for whoever controls the database, not an emailed link: the project has no email service, and an email-based reset would add one more way into the admin panel. A signed-in administrator can change their own password from the admin panel.

### Legacy API key

`ADMIN_API_KEY` (sent as `Authorization: Bearer …`) still works on the enquiry admin endpoints so existing scripts are not broken. Responses to it carry a `Deprecation: true` header. It is never used by the browser. Once nothing depends on it, delete the variable from Netlify and redeploy — that switches the path off.

### Database migrations and rollback

Schema changes are numbered migrations in `server/config/migrations.ts`. They run automatically when the API connects, each inside a transaction, and are recorded in the `schema_migrations` table. They only add tables, columns and indexes.

| Version | Adds |
| --- | --- |
| 1 | `products`, `enquiries` |
| 2 | `admin_users`, `admin_sessions`, `admin_login_attempts` |

To roll back the admin authentication release: redeploy the previous version from Netlify's **Deploys** list (**Publish deploy** on an older entry). The new tables are simply unused by the old code and can stay. To remove them as well, after taking a backup:

```sql
DROP TABLE admin_login_attempts, admin_sessions, admin_users;
DELETE FROM schema_migrations WHERE version = 2;
```

## API

Base URL: `http://localhost:4000` in development; your site's own domain in production.

Every response is JSON in one of two shapes:

```json
{ "success": true, "data": {} }
```

```json
{ "success": false, "message": "Human readable error" }
```

Validation errors (status `400`) also include an `errors` object mapping each field to its message.

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/health` | Public | Reports whether the database and Sheets are ready |
| `GET` | `/api/products` | Public | List active products |
| `GET` | `/api/products/:id` | Public | One product, by id or slug |
| `POST` | `/api/enquiries` | Public, rate limited | Submit an enquiry |
| `GET` | `/api/enquiries` | Admin | List, filter and search enquiries |
| `GET` | `/api/enquiries/:id` | Admin | One enquiry |
| `PATCH` | `/api/enquiries/:id` | Admin | Update an enquiry's status |
| `POST` | `/api/enquiries/sync-sheet` | Admin | Push enquiries that missed Google Sheets |
| `GET` | `/api/admin/overview` | Signed in | Figures for the dashboard's first screen |
| `POST` | `/api/admin/auth/login` | Public, throttled | Sign in; sets the session cookie |
| `GET` | `/api/admin/auth/session` | Signed in | Current administrator and CSRF token |
| `POST` | `/api/admin/auth/logout` | Signed in | End the session |
| `POST` | `/api/admin/auth/change-password` | Signed in | Change own password |

Admin endpoints require a signed-in administrator (session cookie, plus the `X-CSRF-Token` header on anything that changes data) — see [Administrators](#administrators). Changing data needs the `admin` role. The curl examples below use the [legacy API key](#legacy-api-key), which remains available for scripts.

### GET /api/products

Optional query parameters: `featured=true|false`, `category=<name>`.

```bash
curl "http://localhost:4000/api/products?featured=true"
```

Each product includes a ready-made `whatsappEnquiryUrl`.

### GET /api/products/:id

`:id` may be the product's id or its slug. Returns `404` if the product does not exist or is inactive.

### POST /api/enquiries

| Field | Required | Rules |
| --- | --- | --- |
| `name` | yes | 1–100 characters |
| `email` | yes | Valid email address |
| `phone` | yes | 10-digit Indian mobile number; `+91`, `91` or `0` prefix, spaces and dashes allowed |
| `inquiryType` | yes | `Product Enquiry`, `Customization`, `Personalized Styling`, `Institutional / Hospitality`, `Collaboration` or `General Enquiry` |
| `message` | yes | 1–2000 characters |
| `productId` | no | Id or slug of an active product |

```bash
curl -X POST http://localhost:4000/api/enquiries \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Asha Rao",
    "email": "asha@example.com",
    "phone": "+91 98765 43210",
    "inquiryType": "Product Enquiry",
    "message": "I would like to know more about your throws.",
    "productId": "throws"
  }'
```

Success — `201` for a new enquiry, `200` when it was recognised as a duplicate:

```json
{ "success": true, "message": "Enquiry submitted successfully" }
```

Validation failure — `400`:

```json
{
  "success": false,
  "message": "Please check the details you entered.",
  "errors": { "phone": "Enter a valid 10-digit Indian mobile number" }
}
```

Limited to 5 submissions per 15 minutes per IP address; further requests get `429`.

### GET /api/enquiries

Admin. Newest first.

| Query parameter | Meaning |
| --- | --- |
| `status` | `new`, `contacted`, `converted` or `closed` |
| `inquiryType` | One of the six inquiry types |
| `source` | `website`, `whatsapp` or `other` |
| `productId` | Enquiries about one product |
| `hasProduct` | `true` for product enquiries only, `false` for general ones |
| `synced` | `true` for enquiries already in Google Sheets, `false` for those still waiting |
| `search` | Text to find in name, email, phone, message or product name |
| `from`, `to` | Date range, e.g. `2026-10-01` |
| `limit`, `offset` | Paging; `limit` is 1–100, default 50 |

```bash
curl "http://localhost:4000/api/enquiries?status=new&hasProduct=true&search=throw" \
  -H "Authorization: Bearer $ADMIN_API_KEY"
```

```json
{
  "success": true,
  "data": [
    {
      "id": "d1d16ac3-fd18-4ddd-ad21-80169817ea5f",
      "name": "Asha Rao",
      "email": "asha@example.com",
      "phone": "+919876543210",
      "inquiryType": "Product Enquiry",
      "message": "I would like to know more about your throws.",
      "productId": "throws",
      "productName": "Throws",
      "source": "website",
      "status": "new",
      "createdAt": "2026-10-12T09:15:46.189Z",
      "updatedAt": "2026-10-12T09:15:46.189Z",
      "sheetSyncedAt": "2026-10-12T09:15:47.020Z"
    }
  ],
  "pagination": { "total": 1, "limit": 50, "offset": 0 }
}
```

### PATCH /api/enquiries/:id

Admin. Changes the status. The body accepts only `status`.

```bash
curl -X PATCH http://localhost:4000/api/enquiries/d1d16ac3-fd18-4ddd-ad21-80169817ea5f \
  -H "Authorization: Bearer $ADMIN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "status": "contacted" }'
```

### POST /api/enquiries/sync-sheet

Admin. Sends up to 100 enquiries that are not yet in Google Sheets, oldest first, and reports the outcome:

```json
{ "success": true, "data": { "synced": 3, "failed": 0 } }
```

Run it after fixing a Sheets problem. It is safe to run repeatedly — rows already synced are skipped.

### Status codes

| Code | Meaning |
| --- | --- |
| `200` / `201` | Success |
| `400` | Invalid input or malformed JSON |
| `401` | Not signed in, session expired, or wrong credentials |
| `403` | Signed in but not allowed (viewer role), or the CSRF / origin check failed |
| `404` | Not found |
| `413` | Request body over 10 KB |
| `429` | Rate limit reached |
| `500` | Unexpected server error (details are logged, never returned) |
| `503` | Service not ready: database unreachable, or an admin/Sheets feature that is not configured |

## Tests

```bash
npm test
```

The tests start the real API against an in-memory Postgres. The authentication tests cover sign-in, cookie flags, session expiry (idle and absolute), sign-out, password change and reset, CSRF, cross-site requests, roles, unauthenticated access to every admin route, and the legacy key. The enquiry tests cover: a valid enquiry, invalid email, invalid phone, missing name, missing inquiry type, database failure, Google Sheets failure and later re-sync, duplicate and simultaneous submissions, and the admin filter/search/status endpoints. Google Sheets is replaced by a stand-in, so no credentials or network access are needed.

## Security

- **Validation and sanitization** — every input is validated with a schema; control characters and HTML tags are stripped; unknown fields are ignored.
- **SQL injection** — all queries use bound parameters; search text is escaped so it cannot act as a pattern.
- **Spreadsheet formula injection** — rows are written to Google Sheets as raw text, so a message beginning with `=` cannot run as a formula.
- **Rate limiting** — 300 requests / 15 min per IP across the API, 5 / 15 min on enquiry submission, 60 / 15 min on admin endpoints.
- **CORS** — only origins listed in `CORS_ORIGINS` may call the API from another site.
- **Secure headers** — set by Helmet.
- **Admin access** — server-side sessions with HttpOnly cookies, CSRF protection, expiry, database-backed sign-in throttling and roles; see [Administrators](#administrators).
- **Errors** — clients receive a generic message; stack traces and database details stay in the server log.
- **Secrets** — the database URL, Google credentials and admin key are read from environment variables on the server only. None are in the frontend, `public/`, or the repository.

WhatsApp remains a frontend channel: "Enquire on WhatsApp" opens a `wa.me` link with a pre-filled message. The backend holds no WhatsApp credentials, and enquiries that begin on WhatsApp are not recorded automatically.

## Project structure

```
netlify/functions/api.ts   Runs the API on Netlify
server/
  index.ts           Standalone server entry point
  app.ts             Express app: security middleware, routes, error handling
  config/            Environment parsing, database connection, schema, seed data
  routes/            URL → controller mapping
  controllers/       Request parsing and responses
  services/          Enquiry workflow, googleSheetsService
  models/            Database queries for products and enquiries
  middleware/        Rate limiting, admin auth, error handler
  utils/             Validation schemas, sanitizers, logger, HttpError
  scripts/admin.ts   Create and recover administrator accounts
  tests/             API tests
src/                 Public site (see src/config/site.ts for brand settings)
src/admin/           Admin panel (loaded only on /admin)
public/media/        Images and video
```
