import { randomUUID } from 'node:crypto'
import { getDb } from '../config/database.ts'
import type { AdminRole, AdminUser } from './adminUserModel.ts'

export interface AdminSession {
  id: string
  user: AdminUser
  createdAt: string
  lastSeenAt: string
  /** Absolute end of the session, however active it is. */
  expiresAt: string
}

interface SessionRow {
  session_id: string
  session_created_at: Date
  last_seen_at: Date
  expires_at: Date
  user_id: string
  email: string
  name: string
  role: AdminRole
  is_active: boolean
  last_login_at: Date | null
  user_created_at: Date
}

function toSession(row: SessionRow): AdminSession {
  return {
    id: row.session_id,
    createdAt: new Date(row.session_created_at).toISOString(),
    lastSeenAt: new Date(row.last_seen_at).toISOString(),
    expiresAt: new Date(row.expires_at).toISOString(),
    user: {
      id: row.user_id,
      email: row.email,
      name: row.name,
      role: row.role,
      isActive: row.is_active,
      lastLoginAt: row.last_login_at ? new Date(row.last_login_at).toISOString() : null,
      createdAt: new Date(row.user_created_at).toISOString(),
    },
  }
}

export const adminSessionModel = {
  async create(input: {
    userId: string
    tokenHash: string
    maxHours: number
    ipAddress: string
    userAgent: string | null
  }): Promise<{ id: string; expiresAt: string }> {
    const db = await getDb()
    const { rows } = await db.query<{ id: string; expires_at: Date }>(
      `INSERT INTO admin_sessions (id, user_id, token_hash, expires_at, ip_address, user_agent)
       VALUES ($1, $2, $3, now() + make_interval(hours => $4), $5, $6)
       RETURNING id, expires_at`,
      [
        randomUUID(),
        input.userId,
        input.tokenHash,
        input.maxHours,
        input.ipAddress,
        input.userAgent?.slice(0, 300) ?? null,
      ],
    )
    return { id: rows[0].id, expiresAt: new Date(rows[0].expires_at).toISOString() }
  },

  /**
   * Returns the session only if it is still valid: not past its absolute expiry,
   * active within the idle window, and belonging to an active administrator.
   */
  async findValid(tokenHash: string, idleMinutes: number): Promise<AdminSession | null> {
    const db = await getDb()
    const { rows } = await db.query<SessionRow>(
      `SELECT s.id AS session_id, s.created_at AS session_created_at, s.last_seen_at, s.expires_at,
              u.id AS user_id, u.email, u.name, u.role, u.is_active, u.last_login_at,
              u.created_at AS user_created_at
         FROM admin_sessions s
         JOIN admin_users u ON u.id = s.user_id
        WHERE s.token_hash = $1
          AND s.expires_at > now()
          AND s.last_seen_at > now() - make_interval(mins => $2)
          AND u.is_active`,
      [tokenHash, idleMinutes],
    )
    return rows[0] ? toSession(rows[0]) : null
  },

  /** Marks the session as active now, extending its idle window. */
  async touch(id: string): Promise<void> {
    const db = await getDb()
    await db.query('UPDATE admin_sessions SET last_seen_at = now() WHERE id = $1', [id])
  },

  async delete(id: string): Promise<void> {
    const db = await getDb()
    await db.query('DELETE FROM admin_sessions WHERE id = $1', [id])
  },

  /** Signs an administrator out everywhere, optionally keeping one session. */
  async deleteForUser(userId: string, exceptSessionId?: string): Promise<void> {
    const db = await getDb()
    await db.query(
      'DELETE FROM admin_sessions WHERE user_id = $1 AND ($2::uuid IS NULL OR id <> $2::uuid)',
      [userId, exceptSessionId ?? null],
    )
  },

  /** Housekeeping: removes sessions that can no longer be used. */
  async deleteExpired(idleMinutes: number): Promise<void> {
    const db = await getDb()
    await db.query(
      `DELETE FROM admin_sessions
        WHERE expires_at <= now() OR last_seen_at <= now() - make_interval(mins => $1)`,
      [idleMinutes],
    )
  },
}
