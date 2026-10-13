import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import pg from 'pg'
import { env } from './env.ts'
import { migrations } from './migrations.ts'

export interface QueryResult<T> {
  rows: T[]
  rowCount: number
}

/** Anything that can run a query: the database itself, or a transaction. */
export interface Queryable {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<QueryResult<T>>
}

export interface Database extends Queryable {
  /** Runs `fn` inside a transaction; rolls back if it throws. */
  transaction<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>
  close(): Promise<void>
}

/** Production: a real PostgreSQL server reached through DATABASE_URL. */
function connectPostgres(connectionString: string): Database {
  const pool = new pg.Pool({
    connectionString,
    max: 3,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
  })
  // An idle client dropping must not crash the process.
  pool.on('error', () => {})

  const wrap = (runner: pg.Pool | pg.PoolClient): Queryable => ({
    async query<T>(sql: string, params: unknown[] = []) {
      const result = await runner.query(sql, params)
      return { rows: result.rows as T[], rowCount: result.rowCount ?? result.rows.length }
    },
  })

  return {
    ...wrap(pool),
    async transaction(fn) {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        const value = await fn(wrap(client))
        await client.query('COMMIT')
        return value
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {})
        throw err
      } finally {
        client.release()
      }
    },
    close: () => pool.end(),
  }
}

/** Development and tests: Postgres embedded in the Node process — nothing to install. */
async function connectEmbedded(dataDir?: string): Promise<Database> {
  // The module name is kept in a variable so production bundlers do not include
  // this development-only dependency.
  const moduleName = '@electric-sql/pglite'
  const { PGlite } = await import(moduleName)
  if (dataDir) mkdirSync(dataDir, { recursive: true })
  const db = new PGlite(dataDir)

  type Runner = {
    query(sql: string, params?: unknown[]): Promise<{ rows: unknown[]; affectedRows?: number }>
  }
  const wrap = (runner: Runner): Queryable => ({
    async query<T>(sql: string, params: unknown[] = []) {
      const result = await runner.query(sql, params)
      return { rows: result.rows as T[], rowCount: result.affectedRows || result.rows.length }
    },
  })

  return {
    ...wrap(db),
    transaction: (fn) => db.transaction((tx: Runner) => fn(wrap(tx))),
    close: () => db.close(),
  }
}

/** Applies any migrations this database has not seen yet, oldest first. */
async function migrate(db: Database): Promise<void> {
  await db.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       version    INTEGER PRIMARY KEY,
       name       TEXT NOT NULL,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  )

  await db.transaction(async (tx) => {
    // Two instances starting at once must not both run the same migration.
    await tx.query('SELECT pg_advisory_xact_lock(727101)')

    const { rows } = await tx.query<{ version: number }>('SELECT version FROM schema_migrations')
    const applied = new Set(rows.map((r) => r.version))

    for (const migration of migrations) {
      if (applied.has(migration.version)) continue
      for (const statement of migration.statements) await tx.query(statement)
      await migration.seed?.(tx)
      await tx.query('INSERT INTO schema_migrations (version, name) VALUES ($1, $2)', [
        migration.version,
        migration.name,
      ])
    }
  })
}

async function open(): Promise<Database> {
  const url = env.DATABASE_URL

  let db: Database
  if (url?.startsWith('postgres')) db = connectPostgres(url)
  else if (env.isProduction) throw new Error('DATABASE_URL is not set')
  else db = await connectEmbedded(url === 'memory://' ? undefined : resolve('data', 'pglite'))

  await migrate(db)

  return db
}

let connection: Promise<Database> | undefined

/** Returns the shared database connection, opening and preparing it on first call. */
export function getDb(): Promise<Database> {
  connection ??= open().catch((err) => {
    // Allow the next request to retry rather than caching the failure forever.
    connection = undefined
    throw err
  })
  return connection
}

export async function closeDb(): Promise<void> {
  const current = connection
  connection = undefined
  if (current) await (await current).close()
}
