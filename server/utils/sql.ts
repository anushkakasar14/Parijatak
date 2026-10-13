import { HttpError } from './httpError.ts'

/**
 * Builds the SET part of an UPDATE from a partial object, using a fixed map of
 * field → column so that only known columns can ever be written.
 * JSON columns are listed in `jsonFields` and are serialised for the driver.
 */
export function buildUpdate<T extends object>(
  patch: T,
  columns: Partial<Record<keyof T, string>>,
  jsonFields: (keyof T)[] = [],
): { assignments: string; params: unknown[] } {
  const parts: string[] = []
  const params: unknown[] = []

  for (const [field, column] of Object.entries(columns) as [keyof T, string][]) {
    const value = patch[field]
    if (value === undefined) continue
    params.push(jsonFields.includes(field) ? JSON.stringify(value) : value)
    parts.push(`${column} = $${params.length}${jsonFields.includes(field) ? '::jsonb' : ''}`)
  }

  return { assignments: parts.join(', '), params }
}

const UNIQUE_VIOLATION = '23505'
// A blocked delete is reported as 23503 by older PostgreSQL versions and 23001 by newer ones.
const FOREIGN_KEY_VIOLATIONS = ['23503', '23001']

/**
 * Turns the two database constraint errors an administrator can cause into clear
 * messages. Anything else is rethrown and becomes a generic 500.
 */
export function translateConstraintError(
  err: unknown,
  messages: { unique?: string; foreignKey?: string },
): never {
  const code = (err as { code?: string }).code
  if (code === UNIQUE_VIOLATION && messages.unique) throw new HttpError(409, messages.unique)
  if (code && FOREIGN_KEY_VIOLATIONS.includes(code) && messages.foreignKey) {
    throw new HttpError(409, messages.foreignKey)
  }
  throw err
}

export const toIso = (value: Date | string) => new Date(value).toISOString()
export const toIsoOrNull = (value: Date | string | null) => (value ? toIso(value) : null)
