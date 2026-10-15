# Parijatak — Handcrafted Home Textiles

Website, API and admin panel for Parijatak Home Textile Studio.

## Contents

- [Architecture](#architecture)
- [How an enquiry flows](#how-an-enquiry-flows)
- [Local development](#local-development)
- [Environment variables](#environment-variables)
- [Database](#database)
- [Google Cloud and Google Sheets setup](#google-cloud-and-google-sheets-setup)
- [Production deployment (Netlify)](#production-deployment-netlify)
- [Administrators](#administrators)
- [API](#api)
- [Tests](#tests)
- [Security](#security)
- [Known limitations and outstanding work](#known-limitations-and-outstanding-work)
- [Project structure](#project-structure)

## Architecture

```
Browser (React)  →  /api/*  →  Express API  →  PostgreSQL
                               (Netlify function)
                                     ↓
                               Google Sheets (copy of enquiries)
```

- **Frontend** (`src/`) — React, Vite, TypeScript, Tailwind CSS. The public pages read products, the homepage carousel, page text and contact details from the API. The browser never talks to the database and holds no credentials.
- **Admin panel** (`src/admin/`) — a separate bundle loaded only on `/admin`.
- **Backend** (`server/`) — Node.js and Express. On Netlify it runs as one function (`netlify/functions/api.ts`); `netlify.toml` sends `/api/*` to it. The same code also runs as an ordinary server with `npm start`.
- **Database** — PostgreSQL, reached only by the backend through `DATABASE_URL`, using the `pg` driver with parameterized queries and a small connection pool. No ORM.
- **Starting content** (`shared/defaultContent.ts`) — written into a new database once, and used by the site as a fallback if the API cannot be reached.

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

The site is at `http://localhost:5173` and the API at `http://localhost:4000`. Vite forwards `/api/*` to the API. **Both must be running**: the public pages load their content from the API, so with only `npm run dev` the carousel is replaced by a plain panel and products show a "could not be loaded" notice.

The first start creates the tables and fills them with the starting content. To start again from scratch, stop the server and delete the `data/pglite` folder.

| Script | What it does |
| --- | --- |
| `npm run dev` | Frontend dev server |
| `npm run server` | API with auto-restart on file changes |
| `npm start` | API as a standalone server (also serves the built site from `dist/`) |
| `npm run build` | Type-check and build the frontend into `dist/` |
| `npm test` | Run the API tests |
| `npm run admin -- …` | Create and manage administrator accounts (see [Administrators](#administrators)) |
| `npm run typecheck:server` | Type-check the server |

## Environment variables

Set these in `.env` locally and in **Netlify → Site configuration → Environment variables** in production. **Never commit `.env`** — it is in `.gitignore`. None of these values are ever sent to the browser.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `NODE_ENV` | standalone server only | `development` | Set to `production` when running `npm start` on a server. Not needed on Netlify (the function sets it) |
| `DATABASE_URL` | in production | — | PostgreSQL connection string, `postgresql://user:password@host/db?sslmode=require`. Empty in development means the embedded database |
| `GOOGLE_SHEETS_ID` | for Sheets | — | The spreadsheet's ID (from its URL) |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | for Sheets | — | Service account's `client_email` |
| `GOOGLE_PRIVATE_KEY` | for Sheets | — | Service account's `private_key` |
| `GOOGLE_SHEETS_TAB` | no | first tab | Name of the tab to write to |
| `GOOGLE_SHEETS_WEBHOOK_URL` | for Sheets via Apps Script | — | The Apps Script web app address (ends in `/exec`). Replaces the three service-account variables |
| `GOOGLE_SHEETS_WEBHOOK_TOKEN` | with the URL | — | Shared secret, the same as `TOKEN` in the script (24+ characters) |
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

## Database

Production uses **PostgreSQL**. Any provider works; [Neon](https://neon.tech) has a free tier and suits Netlify well.

### Setup

1. Create a Postgres database with your provider.
2. Copy its connection string. On Neon, use the **pooled** connection string (the host contains `-pooler`) — it is designed for serverless functions.
3. Set it as `DATABASE_URL` in Netlify (see [deployment](#production-deployment-netlify)).

There are no migration commands to run. Open `/api/health` to confirm the connection: it reports `"database": "ok"` and never reveals the connection string.

### Migrations

Schema changes are numbered migrations in `server/config/migrations.ts`. They are applied automatically, in order, the first time the API connects after a deploy. Each runs inside a transaction (it applies completely or not at all), is recorded in the `schema_migrations` table so it never runs twice, and is guarded by a lock so two function instances starting together cannot both run it.

| Version | What it does |
| --- | --- |
| 1 | Creates `products` and `enquiries` |
| 2 | Creates `admin_users`, `admin_sessions`, `admin_login_attempts` |
| 3 | Creates `categories`, `homepage_slides`, `site_settings`, `page_sections`, `offers`; adds detail and status columns to `products`; adds notes and sync-error columns to `enquiries`; writes the starting content |

Rules the migrations follow: they only **add** tables, columns and indexes; they never drop or rewrite existing data; and a shipped migration is never edited — a change means a new migration. Anything destructive must be a separate, backed-up, manual step.

Migration 3 keeps existing data: products that were active become `published`, inactive ones become `archived`, and every category name already in use becomes a row in `categories`. The starting content (three products, five carousel slides, page text, contact details) is written once; later edits and deletions are never overwritten.

### Tables

| Table | Holds |
| --- | --- |
| `products` | Name, unique slug, category, short and full description, material, craftsmanship, dimensions, variants, price and offer price, main image with alt text, extra images, customization and featured flags, display order, status |
| `categories` | Product categories and their order |
| `enquiries` | Customer enquiries: contact details, type, message, related product, source, status, internal notes, Google Sheets sync time and last sync error |
| `homepage_slides` | Carousel slides: image or video, poster, alt text, heading, description, button, order, on/off switch, status |
| `page_sections` | The editable text blocks of the Home, About and Collection pages |
| `site_settings` | Brand, contact, social, footer and gallery details |
| `offers` | Offers and banners with optional start and end dates |
| `admin_users`, `admin_sessions`, `admin_login_attempts` | Administrator accounts, sessions and sign-in throttling |
| `schema_migrations` | Which migrations have run |

**Publication status.** Products, slides and offers are `draft`, `published` or `archived`. Only `published` records are returned by public endpoints. A slide must also be switched on, and an offer must be inside its dates. New records start as `draft`.

### Backup and recovery

Enquiries exist only in this database (Google Sheets holds a copy, not the original), so backups matter.

- **Turn on automatic backups** with your provider. Neon keeps a history that lets you restore to an earlier point in time; check how many days your plan retains.
- **Before any risky change**, take a manual copy: `pg_dump "$DATABASE_URL" > backup.sql`. Keep the file somewhere private — it contains customer details.
- **To recover**: restore the provider's backup (or `psql "$DATABASE_URL" < backup.sql` into an empty database), point `DATABASE_URL` at the restored database, and redeploy. The API applies any missing migrations on connect.
- **To undo a code release**, republish the previous deploy from Netlify's **Deploys** list. Because migrations only add things, older code keeps working against the newer database; the extra tables and columns are simply unused.

To remove what a migration added (only after a backup, and only if you are sure):

```sql
-- Migration 3
DROP TABLE offers, page_sections, site_settings, homepage_slides;
ALTER TABLE enquiries DROP COLUMN internal_notes, DROP COLUMN sheet_sync_error, DROP COLUMN sheet_sync_attempted_at;
ALTER TABLE products DROP COLUMN short_description, DROP COLUMN image_alt, DROP COLUMN craftsmanship,
  DROP COLUMN dimensions, DROP COLUMN variants, DROP COLUMN offer_price, DROP COLUMN display_order,
  DROP COLUMN status, DROP COLUMN category_id;
DROP TABLE categories;
DELETE FROM schema_migrations WHERE version = 3;

-- Migration 2
DROP TABLE admin_login_attempts, admin_sessions, admin_users;
DELETE FROM schema_migrations WHERE version = 2;
```

## Google Sheets setup

Optional. With no Google variables set, the API simply skips the sheet. There are two ways to connect it; the first is simpler.

### Option A: Apps Script (no Google Cloud project)

1. In the Google Sheet: **Extensions → Apps Script**. Replace the code with [docs/google-sheets-apps-script.js](docs/google-sheets-apps-script.js) and set `TOKEN` to a long random value (at least 24 characters).
2. **Save**, then **Deploy → New deployment** → type **Web app** → *Execute as*: **Me**, *Who has access*: **Anyone** → **Deploy**, and allow the access Google asks for.
3. Copy the **Web app URL** (ends in `/exec`).
4. In Netlify, add `GOOGLE_SHEETS_WEBHOOK_URL` (the URL) and `GOOGLE_SHEETS_WEBHOOK_TOKEN` (the same TOKEN), marked secret, then redeploy.
5. Admin → Overview → Google Sheets should say **Connected** after **Check connection**.

"Anyone" only lets the address be called without a Google sign-in; the script refuses every request without the TOKEN and offers no way to read the sheet. Rows carry the enquiry's reference in the last column, so a retry never adds a duplicate. After changing the script, deploy a **new version** of the same deployment (Deploy → Manage deployments → Edit) so the URL stays the same.

### Option B: Service account

#### 1. Google Cloud project and Sheets API

1. Open [Google Cloud Console](https://console.cloud.google.com/) and create a project (or pick an existing one).
2. Go to **APIs & Services → Library**, find **Google Sheets API** and click **Enable**.

#### 2. Service account

1. Go to **APIs & Services → Credentials → Create credentials → Service account**. Give it any name; no roles are needed.
2. Open the new service account → **Keys → Add key → Create new key → JSON**. A JSON file downloads.
3. Keep that file private. Do **not** put it in this project folder, the frontend, `public/`, or GitHub.

#### 3. The sheet

1. Create a Google Sheet named **Parijatak Customer Enquiries**.
2. Click **Share** and add the service account's email address (the `client_email` in the JSON file) as an **Editor**.
3. You do not need to type the headings — the API writes this header row the first time it adds an enquiry to an empty sheet:

   | A | B | C | D | E | F | G | H | I |
   | --- | --- | --- | --- | --- | --- | --- | --- | --- |
   | Date | Name | Email | Contact Number | Inquiry Type | Product | Message | Source | Status |

   Dates are written in India Standard Time, e.g. `2026-10-12 15:42`.

#### 4. Environment variables

- `GOOGLE_SHEETS_ID` — the long ID in the sheet's URL: `docs.google.com/spreadsheets/d/<THIS PART>/edit`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` — `client_email` from the JSON file
- `GOOGLE_PRIVATE_KEY` — `private_key` from the JSON file, including the `-----BEGIN PRIVATE KEY-----` and `-----END PRIVATE KEY-----` lines. Paste it exactly as it appears in the JSON, with its `\n` sequences. In a local `.env` file, wrap it in double quotes on one line:

  ```
  GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
  ```

#### 5. Check it

Open `/api/health` — it should report `"googleSheets": "configured"`. Submit a test enquiry and look for the new row.

If no row appears, check the function log for `Google Sheets sync failed`; the message says why. The usual causes are the sheet not being shared with the service account, or the Sheets API not being enabled. Once fixed, call `POST /api/enquiries/sync-sheet` to push everything that was missed.

Note: a later status change (`PATCH /api/enquiries/:id`) is **not** copied to the sheet. Each enquiry is written once, when it is created.

## Production deployment (Netlify)

The repository is set up for Netlify through `netlify.toml`: every push to the `main` branch builds the site and deploys the API as a function at `/api/*`.

**Order matters.** The public pages load their content from the API, so the database must be connected **before** this version goes live. Deployed without `DATABASE_URL`, the homepage shows a plain panel instead of the carousel and the collection shows an error notice.

1. **Database** — create the Postgres database ([Database](#database)).
2. **Environment variables** — in Netlify, go to **Site configuration → Environment variables** and add:

   | Variable | Value |
   | --- | --- |
   | `DATABASE_URL` | your Postgres connection string |
   | `GOOGLE_SHEETS_ID` | the sheet's ID (optional) |
   | `GOOGLE_SERVICE_ACCOUNT_EMAIL` | the service account email (optional) |
   | `GOOGLE_PRIVATE_KEY` | the private key (optional) |

   No session secret is needed: sessions are random tokens stored (hashed) in the database.

   **Do not add `NODE_ENV` in Netlify.** The function sets production mode itself; setting `NODE_ENV=production` as a Netlify variable makes the build skip its tools and fail. Mark `DATABASE_URL` as a secret so its value is hidden in the dashboard.
3. **Deploy** — merge the work into `main` and push, or use **Deploys → Trigger deploy**. Environment variable changes only take effect after a new deploy.
4. **Verify the API** — open `https://your-site/api/health`. A healthy setup returns:

   ```json
   { "success": true, "data": { "status": "ok", "database": "ok", "googleSheets": "configured" } }
   ```

   The first request also runs the migrations, so it can take a few seconds.
5. **Create your administrator account** — on your own computer, with the production `DATABASE_URL` in a local `.env` file: `npm run admin -- create --email … --name "…"` (see [Administrators](#administrators)). Remove the connection string from `.env` afterwards so later local work does not touch production.
6. **Check the site** — the homepage carousel and products load, a test enquiry from the contact form appears in the admin panel (and in the sheet, if configured), and you can sign in at `/admin`.

Function logs are under **Logs → Functions → api** in Netlify.

**Local server and Netlify are not identical.** On Netlify the API is a short-lived function: there is no shared memory between requests, so anything that must persist lives in the database (sessions, sign-in throttling, duplicate protection). The general request rate limits are counted per running instance and are therefore approximate.

**Other hosts.** The same code runs as an ordinary Node server with `npm start` (Node 24+). Set `TRUST_PROXY=1` behind a platform proxy, and `CORS_ORIGINS` if the site is on a different domain.

## Administrators

The admin panel lives at `/admin`. Administrators sign in with an email and password; there is **no public registration** and no way to create an account over the API.

### What the admin panel contains

| Section | Status |
| --- | --- |
| Overview | Enquiry counts by status (including follow-up required) for any date range, product and offer counts, recent changes, quick actions, and a live Google Sheets connection check with a retry button |
| Enquiries | List with search, filters (status, type, product/general, sheet status, received dates in India time), paging, CSV download of the filtered list, full details with copy buttons, status changes and internal notes |
| Products | View-only list of published products |
| Homepage carousel, Offers & banners, Homepage & About, Contact & social | **Screens not built yet** — each page says so. The API behind them exists and is tested (see [Admin content endpoints](#admin-content-endpoints)) |
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

### Migrations and rollback

See [Database → Migrations](#migrations) and [Backup and recovery](#backup-and-recovery).

## API

Base URL: `http://localhost:4000` in development; your site's own domain in production.

Every response is JSON in one of two shapes:

```json
{ "success": true, "data": {} }
```

```json
{ "success": false, "message": "Human readable error" }
```

Validation errors (status `400`) also include an `errors` object mapping each field to its message. List endpoints for administrators add a `pagination` object.

### Public endpoints

No sign-in. Read-only, except submitting an enquiry. They return published content only and never return an enquiry.

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Whether the database and Sheets are ready |
| `GET` | `/api/products` | Published products. Optional `featured=true|false`, `category=<id or name>` |
| `GET` | `/api/products/:id` | One published product, by id or slug |
| `GET` | `/api/categories` | Categories that have at least one published product |
| `GET` | `/api/homepage` | Carousel slides, active offers and the studio gallery |
| `GET` | `/api/pages/:page` | Text blocks of `home`, `about` or `collection` |
| `GET` | `/api/site` | Brand, contact, social and footer details |
| `GET` | `/api/offers` | Offers that are published and inside their dates |
| `POST` | `/api/enquiries` | Submit an enquiry (rate limited) |

Each product includes its `images` (main image first, with alt text), `variants`, `price` / `offerPrice` when set, and a ready-made `whatsappEnquiryUrl` using the WhatsApp number from the site settings.

### Admin endpoints

All require a signed-in administrator; changing data also needs the `admin` role and the `X-CSRF-Token` header. See [Administrators](#administrators).

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/admin/auth/login` | Sign in (public, throttled); sets the session cookie |
| `GET` | `/api/admin/auth/session` | Current administrator and CSRF token |
| `POST` | `/api/admin/auth/logout` | End the session |
| `POST` | `/api/admin/auth/change-password` | Change own password |
| `GET` | `/api/admin/overview` | Figures for the dashboard's first screen |
| `GET` | `/api/enquiries` | List, filter and search enquiries |
| `GET` | `/api/enquiries/:id` | One enquiry |
| `PATCH` | `/api/enquiries/:id` | Update status and/or internal notes |
| `POST` | `/api/enquiries/sync-sheet` | Push enquiries that missed Google Sheets |

#### Admin content endpoints

| Resource | Endpoints under `/api/admin` |
| --- | --- |
| Products | `GET /products` (all statuses; `status`, `categoryId`, `search`, `limit`, `offset`), `GET /products/:id`, `POST /products`, `PATCH /products/:id`, `DELETE /products/:id` |
| Categories | `GET /categories`, `POST /categories`, `PATCH /categories/:id`, `DELETE /categories/:id` (refused while products use it) |
| Carousel slides | `GET /slides`, `POST /slides`, `PATCH /slides/:id`, `DELETE /slides/:id` |
| Page text | `GET /sections` (optional `page`), `PATCH /sections/:id` |
| Site settings | `GET /settings`, `PUT /settings/:key` where key is `brand`, `contact`, `social`, `footer` or `gallery` |
| Offers | `GET /offers`, `POST /offers`, `PATCH /offers/:id`, `DELETE /offers/:id` |

Publishing, unpublishing and archiving are a `PATCH` of `status`. Image, video and button addresses must be a path on the site (`/media/…`, `/collection`) or a full `https://` address; anything else is rejected. Text is stored and shown as plain text — HTML is stripped, never rendered. Deleting a product keeps its enquiries (they retain the product's name).

The curl examples below use the [legacy API key](#legacy-api-key), which works on the enquiry endpoints for scripts.

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

Admin. Changes the status, the internal notes, or both. The body accepts `status` and `internalNotes` (private notes for staff, never shown publicly).

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

The tests start the real API against an in-memory Postgres; no credentials or network access are needed (Google Sheets is replaced by a stand-in). They cover:

- **Enquiries** — valid submission, each invalid field, database failure, Google Sheets failure and later re-sync, duplicate and simultaneous submissions, internal notes, recorded sync errors.
- **Authentication** — sign-in, cookie flags, idle and absolute session expiry, sign-out, password change and reset, CSRF, cross-site requests, roles, every admin route without a session, the legacy key.
- **Content** — published products load; drafts and archived products are hidden from every public endpoint; product, category, slide, section, settings and offer changes persist and appear publicly; offers respect their dates; unsafe addresses and unknown fields are rejected; every content route refuses signed-out visitors and changes from a `viewer`; a database failure returns a generic error.

Other checks:

```bash
npm run build
```

```bash
npm run typecheck:server
```

## Security

- **Validation and sanitization** — every input is validated with a schema; control characters and HTML tags are stripped; unknown fields are ignored.
- **SQL injection** — all queries use bound parameters; search text is escaped so it cannot act as a pattern.
- **Spreadsheet formula injection** — rows are written to Google Sheets as raw text, so a message beginning with `=` cannot run as a formula.
- **Rate limiting** — 300 requests / 15 min per IP across the API, 5 / 15 min on enquiry submission, 60 / 15 min on admin endpoints.
- **CORS** — only origins listed in `CORS_ORIGINS` may call the API from another site.
- **Secure headers** — set by Helmet.
- **Admin access** — server-side sessions with HttpOnly cookies, CSRF protection, expiry, database-backed sign-in throttling and roles; see [Administrators](#administrators).
- **Errors** — clients receive a generic message; stack traces and database details stay in the server log.
- **Unpublished content** — public queries filter on status in the database, and public responses are shaped field by field, so drafts and internal fields cannot leak.
- **Links and media from the database** — only site paths and `https://` addresses are accepted, and all editable text is rendered as plain text, never as HTML.
- **Secrets** — the database URL, Google credentials and admin key are read from environment variables on the server only. None are in the frontend, `public/`, or the repository.

WhatsApp remains a frontend channel: "Enquire on WhatsApp" opens a `wa.me` link with a pre-filled message. The backend holds no WhatsApp credentials, and enquiries that begin on WhatsApp are not recorded automatically.

## Known limitations and outstanding work

- **Admin screens for content are not built.** Products, carousel, offers, page text and contact details can be changed through the API but not yet through the admin panel's pages.
- **No media uploads.** Images and videos are files in `public/media`, referenced by path; adding one needs a code deploy. Uploads require choosing persistent object storage first (Netlify Blobs is the suggested option).
- **No blog.** Nothing in the project uses one; it can be added as a new migration when wanted.
- **Google Sheets has never been run against a real sheet** from this codebase; only its failure handling is verified.
- **Rate limits are approximate on Netlify** (counted per function instance). Sign-in throttling and duplicate protection are exact because they live in the database.
- **Search engines** receive the page shell before the content loads; product and page text is added by JavaScript.
- **WhatsApp enquiries are not recorded.** "Enquire on WhatsApp" opens WhatsApp only.
- **Password recovery is a command**, not an emailed link, because there is no email service.

## Project structure

```
netlify/functions/api.ts   Runs the API on Netlify
netlify.toml               Build settings and /api routing
shared/defaultContent.ts   Starting content: database seed and site fallback
server/
  index.ts           Standalone server entry point
  app.ts             Express app: security middleware, routes, error handling
  config/            Environment parsing, database connection, migrations, seed
  routes/            URL → controller mapping (public and admin)
  controllers/       Request parsing and responses
  services/          Enquiry workflow, authentication, googleSheetsService
  models/            Database queries
  middleware/        Rate limiting, admin authentication, error handler
  utils/             Validation schemas, sanitizers, logger, helpers
  scripts/admin.ts   Create and recover administrator accounts
  tests/             API tests
src/
  pages/, components/      Public site
  context/, hooks/, services/   Loading content from the API
  admin/                   Admin panel (loaded only on /admin)
public/media/              Images and video
```
