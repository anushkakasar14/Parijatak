import type { Queryable } from './database.ts'
import { seedContent } from './seedContent.ts'

/**
 * Database migrations, applied in order and recorded in `schema_migrations`.
 *
 * Rules:
 *  - Never edit a migration that has shipped — add a new one.
 *  - Each migration runs inside a transaction: it applies completely or not at all.
 *  - Migrations only add (tables, columns, indexes). Anything destructive needs a
 *    reviewed, backed-up, manual step and is documented in the README.
 */
export interface Migration {
  version: number
  name: string
  statements: string[]
  /** Optional starting data, run once in the same transaction, after the statements. */
  seed?: (tx: Queryable) => Promise<void>
}

export const migrations: Migration[] = [
  {
    version: 1,
    name: 'products_and_enquiries',
    // Written with IF NOT EXISTS because databases created before migrations
    // were tracked already contain these tables.
    statements: [
      `CREATE TABLE IF NOT EXISTS products (
        id                      TEXT PRIMARY KEY,
        name                    TEXT NOT NULL,
        slug                    TEXT NOT NULL UNIQUE,
        category                TEXT NOT NULL,
        description             TEXT NOT NULL,
        material                TEXT,
        price                   NUMERIC(10, 2),
        image_url               TEXT NOT NULL,
        additional_images       JSONB NOT NULL DEFAULT '[]',
        customization_available BOOLEAN NOT NULL DEFAULT TRUE,
        is_featured             BOOLEAN NOT NULL DEFAULT FALSE,
        is_active               BOOLEAN NOT NULL DEFAULT TRUE,
        created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
      `CREATE TABLE IF NOT EXISTS enquiries (
        id              UUID PRIMARY KEY,
        name            TEXT NOT NULL,
        email           TEXT NOT NULL,
        phone           TEXT NOT NULL,
        inquiry_type    TEXT NOT NULL,
        message         TEXT NOT NULL,
        product_id      TEXT REFERENCES products(id) ON DELETE SET NULL,
        product_name    TEXT,
        source          TEXT NOT NULL DEFAULT 'website' CHECK (source IN ('website', 'whatsapp', 'other')),
        status          TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'converted', 'closed')),
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        sheet_synced_at TIMESTAMPTZ
      )`,
      `CREATE INDEX IF NOT EXISTS enquiries_status_idx ON enquiries (status)`,
      `CREATE INDEX IF NOT EXISTS enquiries_created_at_idx ON enquiries (created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS enquiries_contact_idx ON enquiries (email, phone, created_at DESC)`,
      `CREATE INDEX IF NOT EXISTS enquiries_product_idx ON enquiries (product_id)`,
    ],
  },
  {
    version: 2,
    name: 'admin_authentication',
    statements: [
      // Administrators. Created only through the provisioning script — never over the API.
      `CREATE TABLE admin_users (
        id                  UUID PRIMARY KEY,
        email               TEXT NOT NULL UNIQUE,
        name                TEXT NOT NULL,
        password_hash       TEXT NOT NULL,
        role                TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'viewer')),
        is_active           BOOLEAN NOT NULL DEFAULT TRUE,
        password_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_login_at       TIMESTAMPTZ,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
      // Server-side sessions. Only SHA-256 hashes of the tokens are stored, so a copy
      // of this table cannot be used to sign in.
      `CREATE TABLE admin_sessions (
        id              UUID PRIMARY KEY,
        user_id         UUID NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
        token_hash      TEXT NOT NULL UNIQUE,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        expires_at      TIMESTAMPTZ NOT NULL,
        ip_address      TEXT,
        user_agent      TEXT
      )`,
      `CREATE INDEX admin_sessions_user_idx ON admin_sessions (user_id)`,
      `CREATE INDEX admin_sessions_expires_idx ON admin_sessions (expires_at)`,
      // Sign-in attempts, used for throttling that works across serverless instances.
      `CREATE TABLE admin_login_attempts (
        id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        email      TEXT NOT NULL,
        ip_address TEXT NOT NULL,
        succeeded  BOOLEAN NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX admin_login_attempts_email_idx ON admin_login_attempts (email, created_at DESC)`,
      `CREATE INDEX admin_login_attempts_ip_idx ON admin_login_attempts (ip_address, created_at DESC)`,
    ],
  },
  {
    version: 3,
    name: 'content_management',
    // Additive only: new tables and new nullable/defaulted columns. Existing rows are kept
    // and back-filled; nothing is dropped or rewritten.
    statements: [
      `CREATE TABLE categories (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL UNIQUE,
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,

      // Products: richer detail and a publication status.
      `ALTER TABLE products ADD COLUMN short_description TEXT`,
      `ALTER TABLE products ADD COLUMN image_alt TEXT`,
      `ALTER TABLE products ADD COLUMN craftsmanship TEXT`,
      `ALTER TABLE products ADD COLUMN dimensions TEXT`,
      `ALTER TABLE products ADD COLUMN variants JSONB NOT NULL DEFAULT '[]'`,
      `ALTER TABLE products ADD COLUMN offer_price NUMERIC(10, 2)`,
      `ALTER TABLE products ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0`,
      `ALTER TABLE products ADD COLUMN status TEXT NOT NULL DEFAULT 'draft'
         CHECK (status IN ('draft', 'published', 'archived'))`,
      `ALTER TABLE products ADD COLUMN category_id TEXT REFERENCES categories(id) ON DELETE RESTRICT`,
      // Existing products keep their visibility: active → published, inactive → archived.
      `UPDATE products SET status = CASE WHEN is_active THEN 'published' ELSE 'archived' END`,
      // The three launch products were seeded with room names as categories; give them the
      // product-type categories instead — only where that original value is still untouched.
      `UPDATE products SET category = 'Bed Linens' WHERE id = 'bed-linens' AND category = 'Bedroom'`,
      `UPDATE products SET category = 'Cushion Covers' WHERE id = 'cushion-covers' AND category = 'Living'`,
      `UPDATE products SET category = 'Throws' WHERE id = 'throws' AND category = 'Living & Bedroom'`,
      // Every category name already in use becomes a row in the new table.
      `INSERT INTO categories (id, name)
         SELECT DISTINCT trim(both '-' from lower(regexp_replace(category, '[^a-zA-Z0-9]+', '-', 'g'))), category FROM products
         ON CONFLICT DO NOTHING`,
      `UPDATE products SET category_id = trim(both '-' from lower(regexp_replace(category, '[^a-zA-Z0-9]+', '-', 'g')))
         WHERE EXISTS (SELECT 1 FROM categories c WHERE c.id = trim(both '-' from lower(regexp_replace(products.category, '[^a-zA-Z0-9]+', '-', 'g'))))`,
      `CREATE INDEX products_status_order_idx ON products (status, display_order)`,
      `CREATE INDEX products_category_idx ON products (category_id)`,

      // Enquiries: private notes for staff, and a record of why a Sheets sync failed.
      `ALTER TABLE enquiries ADD COLUMN internal_notes TEXT`,
      `ALTER TABLE enquiries ADD COLUMN sheet_sync_error TEXT`,
      `ALTER TABLE enquiries ADD COLUMN sheet_sync_attempted_at TIMESTAMPTZ`,

      `CREATE TABLE homepage_slides (
        id            UUID PRIMARY KEY,
        media_type    TEXT NOT NULL CHECK (media_type IN ('image', 'video')),
        media_url     TEXT NOT NULL,
        poster_url    TEXT,
        alt_text      TEXT NOT NULL DEFAULT '',
        eyebrow       TEXT,
        heading       TEXT NOT NULL,
        description   TEXT,
        cta_label     TEXT,
        cta_url       TEXT,
        display_order INTEGER NOT NULL DEFAULT 0,
        is_active     BOOLEAN NOT NULL DEFAULT TRUE,
        status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX homepage_slides_order_idx ON homepage_slides (status, display_order)`,

      // Brand, contact, social and footer details, one JSON document per key.
      `CREATE TABLE site_settings (
        key        TEXT PRIMARY KEY,
        value      JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,

      // Editable text blocks of the Home, About and Collection pages. The set of blocks is
      // fixed by the page designs; their wording and images are editable.
      `CREATE TABLE page_sections (
        id            TEXT PRIMARY KEY,
        page          TEXT NOT NULL,
        label         TEXT NOT NULL,
        eyebrow       TEXT,
        heading       TEXT NOT NULL,
        body          TEXT NOT NULL DEFAULT '',
        image_url     TEXT,
        image_alt     TEXT,
        cta_label     TEXT,
        cta_url       TEXT,
        display_order INTEGER NOT NULL DEFAULT 0,
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX page_sections_page_idx ON page_sections (page, display_order)`,

      `CREATE TABLE offers (
        id               UUID PRIMARY KEY,
        title            TEXT NOT NULL,
        description      TEXT,
        discount_text    TEXT,
        banner_image_url TEXT,
        banner_image_alt TEXT,
        cta_label        TEXT,
        cta_url          TEXT,
        starts_at        TIMESTAMPTZ,
        ends_at          TIMESTAMPTZ,
        status           TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX offers_status_idx ON offers (status, starts_at, ends_at)`,
    ],
    // Starting content, written once. Later edits and deletions are never overwritten.
    seed: seedContent,
  },
  {
    version: 4,
    name: 'categories_and_media',
    // Additive: two category columns, a media table, and a relaxed foreign key so a
    // category's web address (its id) can be changed without breaking its products.
    statements: [
      `ALTER TABLE categories ADD COLUMN description TEXT`,
      `ALTER TABLE categories ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE`,
      // Same rule as before (a category in use cannot be deleted), plus: renaming a
      // category's id carries its products along.
      `ALTER TABLE products DROP CONSTRAINT IF EXISTS products_category_id_fkey`,
      `ALTER TABLE products ADD CONSTRAINT products_category_id_fkey
         FOREIGN KEY (category_id) REFERENCES categories(id) ON UPDATE CASCADE ON DELETE RESTRICT`,
      `CREATE INDEX products_updated_idx ON products (updated_at DESC)`,

      // Uploaded images. The file itself lives in object storage under storage_key;
      // url is the public address pages use.
      `CREATE TABLE media_assets (
        id           UUID PRIMARY KEY,
        storage_key  TEXT NOT NULL UNIQUE,
        url          TEXT NOT NULL UNIQUE,
        filename     TEXT NOT NULL,
        content_type TEXT NOT NULL,
        byte_size    INTEGER NOT NULL,
        width        INTEGER,
        height       INTEGER,
        alt_text     TEXT NOT NULL DEFAULT '',
        uploaded_by  UUID REFERENCES admin_users(id) ON DELETE SET NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
      `CREATE INDEX media_assets_created_idx ON media_assets (created_at DESC)`,
    ],
  },
  {
    version: 5,
    name: 'enquiry_follow_up_status',
    // Additive: allows one more status value. Existing enquiries keep their status.
    statements: [
      `ALTER TABLE enquiries DROP CONSTRAINT IF EXISTS enquiries_status_check`,
      `ALTER TABLE enquiries ADD CONSTRAINT enquiries_status_check
         CHECK (status IN ('new', 'contacted', 'follow_up', 'converted', 'closed'))`,
    ],
  },
  {
    version: 6,
    name: 'product_images',
    // Additive: one row per product picture. Existing pictures are copied in; the old
    // columns (image_url, image_alt, additional_images) stay and are kept in step with
    // this table, so everything that reads them keeps working.
    statements: [
      `CREATE TABLE product_images (
        id              UUID PRIMARY KEY,
        product_id      TEXT NOT NULL REFERENCES products(id) ON UPDATE CASCADE ON DELETE CASCADE,
        -- The uploaded file, when the picture is one. A file in use cannot be deleted.
        media_asset_id  UUID REFERENCES media_assets(id) ON DELETE RESTRICT,
        url             TEXT NOT NULL CHECK (url <> ''),
        alt_text        TEXT NOT NULL DEFAULT '',
        position        INTEGER NOT NULL CHECK (position >= 0),
        is_primary      BOOLEAN NOT NULL DEFAULT FALSE,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
        -- Checked at commit, so a reorder can swap positions inside one transaction.
        CONSTRAINT product_images_position_unique UNIQUE (product_id, position) DEFERRABLE INITIALLY DEFERRED
      )`,
      // At most one primary picture per product.
      `CREATE UNIQUE INDEX product_images_one_primary ON product_images (product_id) WHERE is_primary`,
      `CREATE INDEX product_images_media_idx ON product_images (media_asset_id)`,

      // Copy the main pictures (position 0, primary)…
      `INSERT INTO product_images (id, product_id, media_asset_id, url, alt_text, position, is_primary, created_at)
       SELECT gen_random_uuid(), p.id, m.id, p.image_url, COALESCE(p.image_alt, ''), 0, TRUE, p.created_at
         FROM products p
         LEFT JOIN media_assets m ON m.url = p.image_url
        WHERE p.image_url <> ''`,
      // …then the extra pictures in their saved order. Older rows stored bare addresses.
      `INSERT INTO product_images (id, product_id, media_asset_id, url, alt_text, position, is_primary, created_at)
       SELECT gen_random_uuid(), p.id, m.id, e.url, e.alt, e.ord::int, FALSE, p.created_at
         FROM products p
        CROSS JOIN LATERAL (
          SELECT CASE WHEN jsonb_typeof(x.value) = 'string' THEN x.value #>> '{}' ELSE x.value ->> 'url' END AS url,
                 CASE WHEN jsonb_typeof(x.value) = 'string' THEN '' ELSE COALESCE(x.value ->> 'alt', '') END AS alt,
                 x.ord
            FROM jsonb_array_elements(p.additional_images) WITH ORDINALITY AS x(value, ord)
        ) e
         LEFT JOIN media_assets m ON m.url = e.url
        WHERE COALESCE(e.url, '') <> ''`,
    ],
  },
  {
    version: 7,
    name: 'integration_status',
    // Additive: when an outside service last used an integration (for example, when the
    // Google Sheet last read the enquiries feed), so the admin shows facts, not guesses.
    statements: [
      `CREATE TABLE integration_status (
        name             TEXT PRIMARY KEY,
        last_success_at  TIMESTAMPTZ,
        detail           TEXT
      )`,
    ],
  },
  {
    version: 8,
    name: 'video_uploads',
    // Additive: uploaded files can be videos too. A video is stored in pieces (so it can
    // be uploaded and played back through the function's ~6 MB request limit), and an
    // upload in progress is tracked until every piece has arrived.
    statements: [
      `ALTER TABLE media_assets ADD COLUMN kind TEXT NOT NULL DEFAULT 'image' CHECK (kind IN ('image', 'video'))`,
      `ALTER TABLE media_assets ADD COLUMN chunk_size INTEGER`,
      `ALTER TABLE media_assets ADD COLUMN chunk_count INTEGER`,
      `ALTER TABLE media_assets ADD COLUMN duration_seconds NUMERIC(10, 2)`,
      `CREATE INDEX media_assets_kind_idx ON media_assets (kind, created_at DESC)`,
      `CREATE TABLE media_uploads (
        id               UUID PRIMARY KEY,
        filename         TEXT NOT NULL,
        content_type     TEXT NOT NULL,
        byte_size        INTEGER NOT NULL CHECK (byte_size > 0),
        chunk_size       INTEGER NOT NULL CHECK (chunk_size > 0),
        chunk_count      INTEGER NOT NULL CHECK (chunk_count > 0),
        received_chunks  INTEGER[] NOT NULL DEFAULT '{}',
        width            INTEGER,
        height           INTEGER,
        duration_seconds NUMERIC(10, 2),
        uploaded_by      UUID REFERENCES admin_users(id) ON DELETE SET NULL,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
    ],
  },
]
