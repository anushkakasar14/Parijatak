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
]
