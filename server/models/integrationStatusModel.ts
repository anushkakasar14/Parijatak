import { getDb } from '../config/database.ts'
import { toIso } from '../utils/sql.ts'

/** When an outside service last used one of the site's integrations successfully. */
export const integrationStatusModel = {
  async recordSuccess(name: string, detail: string): Promise<void> {
    const db = await getDb()
    await db.query(
      `INSERT INTO integration_status (name, last_success_at, detail) VALUES ($1, now(), $2)
       ON CONFLICT (name) DO UPDATE SET last_success_at = now(), detail = EXCLUDED.detail`,
      [name, detail],
    )
  },

  async get(name: string): Promise<{ lastSuccessAt: string | null; detail: string | null }> {
    const db = await getDb()
    const { rows } = await db.query<{ last_success_at: Date | null; detail: string | null }>(
      'SELECT last_success_at, detail FROM integration_status WHERE name = $1',
      [name],
    )
    return {
      lastSuccessAt: rows[0]?.last_success_at ? toIso(rows[0].last_success_at) : null,
      detail: rows[0]?.detail ?? null,
    }
  },
}
