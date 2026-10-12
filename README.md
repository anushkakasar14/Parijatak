# Parijatak — Handcrafted Home Textiles

Website and API for Parijatak Home Textile Studio.

- **Frontend** (`/src`) — React, Vite, TypeScript, Tailwind CSS.
- **Backend** (`/server`) — Node.js, Express, SQLite. Stores enquiries and products, and copies each enquiry to a Google Sheet.

## Contents

- [Setup](#setup)
- [Environment variables](#environment-variables)
- [Database](#database)
- [API](#api)
- [Google Sheets setup](#google-sheets-setup)
- [WhatsApp](#whatsapp)
- [Security](#security)
- [Deployment](#deployment)
- [Project structure](#project-structure)

## Setup

Requires **Node.js 24 or newer**. The server runs TypeScript directly on Node and uses Node's built-in SQLite, so there is no server build step and no database to install.

```bash
npm install
```

Create your local configuration (the defaults work as-is for development):

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

The site is at `http://localhost:5173` and the API at `http://localhost:4000`. In development Vite forwards `/api/*` to the API, so the contact form works without extra configuration.

| Script | What it does |
| --- | --- |
| `npm run dev` | Frontend dev server |
| `npm run server` | API with auto-restart on file changes |
| `npm start` | API for production (also serves the built site from `dist/`) |
| `npm run build` | Type-check and build the frontend into `dist/` |
| `npm run typecheck:server` | Type-check the server |

## Environment variables

Set these in `.env` locally and in your host's dashboard in production. **Never commit `.env`** — it is already in `.gitignore`.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `NODE_ENV` | in production | `development` | Set to `production` when deployed |
| `PORT` | no | `4000` | Port the API listens on |
| `DATABASE_URL` | no | `file:./data/parijatk.db` | Location of the SQLite file |
| `CORS_ORIGINS` | in production | `http://localhost:5173` | Comma-separated origins allowed to call the API, e.g. `https://parijatak.com,https://www.parijatak.com` |
| `TRUST_PROXY` | in production | `0` | Number of reverse proxies in front of the server. Usually `1` on a hosting platform. Rate limiting needs this to see real visitor IPs |
| `ADMIN_API_KEY` | for admin endpoints | — | Secret for `GET`/`PATCH /api/enquiries`. Minimum 24 characters. While empty, those endpoints are disabled |
| `GOOGLE_SHEETS_ID` | for Sheets | — | The spreadsheet's ID (from its URL) |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | for Sheets | — | Service account's `client_email` |
| `GOOGLE_PRIVATE_KEY` | for Sheets | — | Service account's `private_key` |
| `GOOGLE_SHEETS_RANGE` | no | `A1` | Where rows are appended. `A1` is the first tab; use `Enquiries!A1` for a tab named "Enquiries" |
| `WHATSAPP_NUMBER` | no | `917385087502` | Digits only, with country code. Used for the WhatsApp links returned with products |

Frontend only: set `VITE_API_URL` (e.g. `https://api.parijatak.com`) at build time **only if** the API is hosted on a different domain from the site. Nothing secret may ever go in a `VITE_` variable — those are shipped to the browser.

Generate an admin key:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Database

SQLite, stored in a single file. The tables are created automatically the first time the server starts, and the three launch products are inserted if the products table is empty. There is nothing to run by hand.

**`enquiries`**

| Field | Notes |
| --- | --- |
| `id` | UUID |
| `name`, `email`, `phone` | Phone is normalised to `+91XXXXXXXXXX` |
| `inquiryType` | One of the six types listed under [POST /api/enquiries](#post-apienquiries) |
| `message` | |
| `productId`, `productName` | Set when the enquiry is about a product, otherwise `null` |
| `source` | `website` \| `whatsapp` \| `other` |
| `status` | `new` \| `contacted` \| `converted` \| `closed` |
| `createdAt`, `updatedAt` | ISO 8601, UTC |

**`products`**

`id`, `name`, `slug`, `category`, `description`, `material`, `price`, `imageUrl`, `additionalImages`, `customizationAvailable`, `isFeatured`, `isActive`, `createdAt`, `updatedAt`.

`material` and `price` are `null` for the seeded products until Parijatak confirms them. Products with `isActive = false` are never returned by the API.

**Backups.** The database is the source of truth for enquiries. Back up the file named in `DATABASE_URL` regularly (plus its `-wal` companion file if present).

## API

Base URL: `http://localhost:4000` in development.

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
| `GET` | `/api/health` | Public | Uptime check |
| `GET` | `/api/products` | Public | List active products |
| `GET` | `/api/products/:id` | Public | One product, by id or slug |
| `POST` | `/api/enquiries` | Public, rate limited | Submit an enquiry |
| `GET` | `/api/enquiries` | Admin | List enquiries |
| `PATCH` | `/api/enquiries/:id` | Admin | Update an enquiry's status |

Admin endpoints need the header `Authorization: Bearer <ADMIN_API_KEY>`.

### GET /api/products

Optional query parameters: `featured=true|false`, `category=<name>`.

```bash
curl "http://localhost:4000/api/products?featured=true"
```

```json
{
  "success": true,
  "data": [
    {
      "id": "bed-linens",
      "name": "Bed Linens",
      "slug": "bed-linens",
      "category": "Bedroom",
      "description": "Bed linens rooted in Indian traditional craftsmanship…",
      "material": null,
      "price": null,
      "imageUrl": "/media/product-bed-linens.svg",
      "additionalImages": [],
      "customizationAvailable": true,
      "isFeatured": true,
      "createdAt": "2026-10-12T09:15:41.334Z",
      "updatedAt": "2026-10-12T09:15:41.334Z",
      "whatsappEnquiryUrl": "https://wa.me/917385087502?text=Hello%20Parijatak…"
    }
  ]
}
```

### GET /api/products/:id

`:id` may be the product's id or its slug. Returns `404` if the product does not exist or is inactive.

```bash
curl http://localhost:4000/api/products/throws
```

### POST /api/enquiries

Used by the contact form and for product enquiries.

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

Success — `201`:

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

What happens on submit: the input is validated and cleaned → saved to the database → appended to the Google Sheet → success is returned. If the Google Sheets step fails, the enquiry is still saved and the customer still sees success; the failure is written to the server log with the enquiry's id so the row can be added to the sheet by hand.

### GET /api/enquiries

Admin. Newest first. Optional query parameters: `status`, `limit` (1–100, default 50), `offset` (default 0).

```bash
curl "http://localhost:4000/api/enquiries?status=new&limit=20" \
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
      "updatedAt": "2026-10-12T09:15:46.189Z"
    }
  ],
  "pagination": { "total": 1, "limit": 20, "offset": 0 }
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

Returns the updated enquiry. A status change is **not** pushed to the Google Sheet — the sheet receives each enquiry once, when it is created.

### Status codes

| Code | Meaning |
| --- | --- |
| `200` / `201` | Success |
| `400` | Invalid input or malformed JSON |
| `401` | Missing or wrong admin key |
| `404` | Not found |
| `413` | Request body over 10 KB |
| `429` | Rate limit reached |
| `500` | Unexpected server error (details are logged, never returned) |
| `503` | Admin endpoints called while `ADMIN_API_KEY` is not set |

## Google Sheets setup

Optional. Leave the three `GOOGLE_*` variables empty and the API simply skips the sheet.

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project (or pick an existing one).
2. Go to **APIs & Services → Library**, find **Google Sheets API** and enable it.
3. Go to **APIs & Services → Credentials → Create credentials → Service account**. Give it any name; no roles are needed.
4. Open the new service account → **Keys → Add key → Create new key → JSON**. A JSON file downloads. Keep it private and do not put it in this project folder.
5. Create a Google Sheet. In row 1, add these headers in this order:

   `Created At` · `Enquiry ID` · `Name` · `Email` · `Phone` · `Inquiry Type` · `Product` · `Message` · `Source` · `Status`

6. Click **Share** on the sheet and add the service account's email address (the `client_email` in the JSON file) as an **Editor**.
7. Fill in `.env`:
   - `GOOGLE_SHEETS_ID` — the long ID in the sheet's URL: `docs.google.com/spreadsheets/d/<THIS PART>/edit`
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL` — `client_email` from the JSON file
   - `GOOGLE_PRIVATE_KEY` — `private_key` from the JSON file, on one line, in double quotes, keeping the `\n` sequences exactly as they appear:

     ```
     GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIIE...\n-----END PRIVATE KEY-----\n"
     ```

8. Restart the server. The startup log line shows `"googleSheets":"enabled"`. Submit a test enquiry and check that a row appears.

If rows do not appear, look in the server log for `Google Sheets sync failed` — the message says why (most often the sheet has not been shared with the service account, or the Sheets API is not enabled).

## WhatsApp

WhatsApp is a frontend conversion channel: "Enquire on WhatsApp" opens `https://wa.me/917385087502?text=…` with a pre-filled message. The backend holds no WhatsApp credentials and sends no messages. It only builds the same link (`whatsappEnquiryUrl`) into product responses, using `WHATSAPP_NUMBER`.

Enquiries that begin on WhatsApp are therefore not recorded automatically. The `whatsapp` value of `source` is there for a future admin tool to log them by hand.

## Security

- **Validation and sanitization** — every input is validated with a schema; control characters and HTML tags are stripped; unknown fields are ignored.
- **SQL injection** — all queries use bound parameters.
- **Spreadsheet formula injection** — rows are written to Google Sheets as raw text, so a message beginning with `=` cannot run as a formula.
- **Rate limiting** — 300 requests / 15 min per IP across the API, 5 / 15 min on enquiry submission, 60 / 15 min on admin endpoints.
- **CORS** — only origins listed in `CORS_ORIGINS` may call the API from a browser.
- **Secure headers** — set by Helmet (Content-Security-Policy, HSTS, no-sniff and others).
- **Admin access** — a bearer key compared in constant time; endpoints are closed while no key is configured.
- **Errors** — clients receive a generic message; stack traces and database details stay in the server log.
- **Secrets** — read from environment variables only; none are present in frontend code.

The admin key is a single shared secret, suitable for scripts and a first internal tool. Before building a multi-user admin panel, replace it with real user accounts and sessions.

## Deployment

Requirements:

- **Node.js 24+**.
- **A persistent disk** for the SQLite file. On platforms whose filesystem is wiped on every deploy or restart (most serverless and free container tiers), enquiries would be lost — attach a persistent volume and point `DATABASE_URL` at it, e.g. `file:/var/data/parijatk.db`.
- **A single server instance.** SQLite and the in-memory rate limiter are not shared between instances.
- **HTTPS**, provided by the host or a reverse proxy.

Simplest setup — one service serving both the site and the API:

1. Build command: `npm install && npm run build`
2. Start command: `npm start`
3. Set the environment variables: `NODE_ENV=production`, `TRUST_PROXY=1`, `CORS_ORIGINS=https://your-domain`, `DATABASE_URL`, `ADMIN_API_KEY`, and the `GOOGLE_*` values.

When `dist/` exists, the server serves the built site and handles page routes such as `/collection`, so no separate static hosting is needed.

Alternative — site on a static host, API elsewhere: build the frontend with `VITE_API_URL=https://your-api-domain`, add the site's origin to `CORS_ORIGINS` on the API, and configure the static host to serve `index.html` for all routes.

## Project structure

```
server/
  index.ts           Starts the HTTP server
  app.ts             Express app: security middleware, routes, error handling
  config/            Environment parsing, database connection, schema, seed data
  routes/            URL → controller mapping
  controllers/       Request parsing and responses
  services/          Enquiry workflow, googleSheetsService
  models/            Database queries for products and enquiries
  middleware/        Rate limiting, admin auth, error handler
  utils/             Validation schemas, sanitizers, logger, HttpError
src/                 Frontend (see src/config/site.ts for brand settings)
public/media/        Images
```
