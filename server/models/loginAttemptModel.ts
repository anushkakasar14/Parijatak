import { getDb } from '../config/database.ts'

export const loginAttemptModel = {
  async record(email: string, ipAddress: string, succeeded: boolean): Promise<void> {
    const db = await getDb()
    await db.query(
      'INSERT INTO admin_login_attempts (email, ip_address, succeeded) VALUES ($1, $2, $3)',
      [email.toLowerCase().slice(0, 254), ipAddress, succeeded],
    )
  },

  /** Failed sign-ins in the last `minutes`, counted three ways. */
  async countRecentFailures(email: string, ipAddress: string, minutes: number) {
    const db = await getDb()
    const { rows } = await db.query<{ pair: number; ip: number; email: number }>(
      `SELECT COUNT(*) FILTER (WHERE email = $1 AND ip_address = $2)::int AS pair,
              COUNT(*) FILTER (WHERE ip_address = $2)::int               AS ip,
              COUNT(*) FILTER (WHERE email = $1)::int                    AS email
         FROM admin_login_attempts
        WHERE NOT succeeded
          AND created_at > now() - make_interval(mins => $3)
          AND (email = $1 OR ip_address = $2)`,
      [email.toLowerCase(), ipAddress, minutes],
    )
    return rows[0]
  },

  /** Housekeeping: attempts older than a day are no longer needed. */
  async deleteOld(): Promise<void> {
    const db = await getDb()
    await db.query(`DELETE FROM admin_login_attempts WHERE created_at < now() - interval '1 day'`)
  },
}
