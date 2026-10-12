import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { env } from './env.ts'
import { seedProducts } from './seedProducts.ts'

function openDatabase(): DatabaseSync {
  const location = env.DATABASE_URL.replace(/^file:/, '')
  if (location === ':memory:') return new DatabaseSync(location)

  const file = resolve(location)
  mkdirSync(dirname(file), { recursive: true })
  return new DatabaseSync(file)
}

export const db = openDatabase()

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS products (
    id                      TEXT PRIMARY KEY,
    name                    TEXT NOT NULL,
    slug                    TEXT NOT NULL UNIQUE,
    category                TEXT NOT NULL,
    description             TEXT NOT NULL,
    material                TEXT,
    price                   REAL,
    image_url               TEXT NOT NULL,
    additional_images       TEXT NOT NULL DEFAULT '[]',
    customization_available INTEGER NOT NULL DEFAULT 1,
    is_featured             INTEGER NOT NULL DEFAULT 0,
    is_active               INTEGER NOT NULL DEFAULT 1,
    created_at              TEXT NOT NULL,
    updated_at              TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS enquiries (
    id           TEXT PRIMARY KEY,
    name         TEXT NOT NULL,
    email        TEXT NOT NULL,
    phone        TEXT NOT NULL,
    inquiry_type TEXT NOT NULL,
    message      TEXT NOT NULL,
    product_id   TEXT REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT,
    source       TEXT NOT NULL DEFAULT 'website' CHECK (source IN ('website', 'whatsapp', 'other')),
    status       TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'converted', 'closed')),
    created_at   TEXT NOT NULL,
    updated_at   TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS enquiries_status_idx ON enquiries (status);
  CREATE INDEX IF NOT EXISTS enquiries_created_at_idx ON enquiries (created_at);
`)

// Seed the catalogue on first run only.
const { count } = db.prepare('SELECT COUNT(*) AS count FROM products').get() as { count: number }

if (count === 0) {
  const insert = db.prepare(`
    INSERT INTO products (id, name, slug, category, description, image_url, is_featured, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
  `)
  const now = new Date().toISOString()
  for (const p of seedProducts) {
    insert.run(p.id, p.name, p.slug, p.category, p.description, p.imageUrl, now, now)
  }
}
