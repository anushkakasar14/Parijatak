import { randomUUID } from 'node:crypto'
import { getDb } from '../config/database.ts'

export const adminRoles = ['admin', 'viewer'] as const
/** `admin` can change things; `viewer` can only read. */
export type AdminRole = (typeof adminRoles)[number]

export interface AdminUser {
  id: string
  email: string
  name: string
  role: AdminRole
  isActive: boolean
  lastLoginAt: string | null
  createdAt: string
}

/** Includes the password hash — never send this shape to a client. */
export interface AdminUserWithSecret extends AdminUser {
  passwordHash: string
}

interface AdminUserRow {
  id: string
  email: string
  name: string
  password_hash: string
  role: AdminRole
  is_active: boolean
  last_login_at: Date | null
  created_at: Date
}

function toUser(row: AdminUserRow): AdminUserWithSecret {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    isActive: row.is_active,
    lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null,
    createdAt: new Date(row.created_at).toISOString(),
    passwordHash: row.password_hash,
  }
}

/** Strips the password hash. */
export function toPublicAdmin({ passwordHash: _hash, ...user }: AdminUserWithSecret): AdminUser {
  return user
}

export const adminUserModel = {
  async create(input: { email: string; name: string; passwordHash: string; role: AdminRole }) {
    const db = await getDb()
    const { rows } = await db.query<AdminUserRow>(
      `INSERT INTO admin_users (id, email, name, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [randomUUID(), input.email.toLowerCase(), input.name, input.passwordHash, input.role],
    )
    return toUser(rows[0])
  },

  async findByEmail(email: string): Promise<AdminUserWithSecret | null> {
    const db = await getDb()
    const { rows } = await db.query<AdminUserRow>('SELECT * FROM admin_users WHERE email = $1', [
      email.toLowerCase(),
    ])
    return rows[0] ? toUser(rows[0]) : null
  },

  async findById(id: string): Promise<AdminUserWithSecret | null> {
    const db = await getDb()
    const { rows } = await db.query<AdminUserRow>('SELECT * FROM admin_users WHERE id = $1', [id])
    return rows[0] ? toUser(rows[0]) : null
  },

  async list(): Promise<AdminUser[]> {
    const db = await getDb()
    const { rows } = await db.query<AdminUserRow>('SELECT * FROM admin_users ORDER BY created_at')
    return rows.map((row) => toPublicAdmin(toUser(row)))
  },

  async setPassword(id: string, passwordHash: string): Promise<void> {
    const db = await getDb()
    await db.query(
      `UPDATE admin_users
          SET password_hash = $1, password_changed_at = now(), updated_at = now()
        WHERE id = $2`,
      [passwordHash, id],
    )
  },

  async setActive(id: string, isActive: boolean): Promise<void> {
    const db = await getDb()
    await db.query('UPDATE admin_users SET is_active = $1, updated_at = now() WHERE id = $2', [
      isActive,
      id,
    ])
  },

  async recordLogin(id: string): Promise<void> {
    const db = await getDb()
    await db.query('UPDATE admin_users SET last_login_at = now() WHERE id = $1', [id])
  },
}
