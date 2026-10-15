import { z } from 'zod'

// Load .env if present. In production, variables usually come from the host instead.
if (process.env.NODE_ENV !== 'test') {
  try {
    process.loadEnvFile()
  } catch {
    // No .env file — rely on the real environment.
  }
}

const optional = z
  .string()
  .trim()
  .optional()
  .transform((v) => v || undefined)

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  /**
   * PostgreSQL connection string, e.g. postgresql://user:pass@host/db?sslmode=require
   * Required in production. When empty in development, an embedded Postgres stored in
   * ./data/pglite is used instead, so no database needs to be installed locally.
   */
  DATABASE_URL: optional.refine((v) => !v || /^(postgres(ql)?|memory):\/\//.test(v), {
    message: 'DATABASE_URL must start with postgresql://',
  }),

  /** Comma-separated list of origins allowed to call the API from a browser. */
  CORS_ORIGINS: z.string().trim().default('http://localhost:5173'),

  /** Number of reverse proxies in front of the server (needed for correct rate limiting). */
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  /** Minutes of inactivity after which an admin session ends. */
  ADMIN_SESSION_IDLE_MINUTES: z.coerce.number().int().min(5).max(240).default(30),
  /** Hours after sign-in at which an admin session ends regardless of activity. */
  ADMIN_SESSION_MAX_HOURS: z.coerce.number().int().min(1).max(72).default(12),

  /**
   * LEGACY. Shared secret accepted as `Authorization: Bearer …` on admin endpoints, kept so
   * existing scripts keep working. Administrators sign in with their own accounts instead.
   * Remove this variable to switch the legacy path off.
   */
  ADMIN_API_KEY: optional.refine((v) => !v || v.length >= 24, {
    message: 'ADMIN_API_KEY must be at least 24 characters',
  }),

  GOOGLE_SHEETS_ID: optional,
  GOOGLE_SERVICE_ACCOUNT_EMAIL: optional,
  GOOGLE_PRIVATE_KEY: optional,
  /** Tab to write to. Leave empty to use the first tab of the spreadsheet. */
  GOOGLE_SHEETS_TAB: optional,

  /**
   * Alternative to the service account: the sheet's own Apps Script web app
   * (docs/google-sheets-apps-script.js). Its address and the shared token in that script.
   */
  GOOGLE_SHEETS_WEBHOOK_URL: optional.refine((v) => !v || /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(v), {
    message: 'GOOGLE_SHEETS_WEBHOOK_URL must be the web app address ending in /exec',
  }),
  GOOGLE_SHEETS_WEBHOOK_TOKEN: optional.refine((v) => !v || v.length >= 24, {
    message: 'GOOGLE_SHEETS_WEBHOOK_TOKEN must be at least 24 characters',
  }),

  WHATSAPP_NUMBER: z
    .string()
    .trim()
    .regex(/^\d{10,15}$/, 'WHATSAPP_NUMBER must be digits only, with country code')
    .default('917385087502'),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  // Report which variables are wrong without printing their values.
  const problems = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)
  throw new Error(`Invalid environment configuration — ${problems.join('; ')}`)
}

export const env = {
  ...parsed.data,
  isProduction: parsed.data.NODE_ENV === 'production',
  isTest: parsed.data.NODE_ENV === 'test',
  corsOrigins: parsed.data.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  // Hosting dashboards often store the key with literal "\n" sequences.
  googlePrivateKey: parsed.data.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
}
