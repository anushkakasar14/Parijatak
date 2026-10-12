import { z } from 'zod'

// Load .env if present. In production, variables usually come from the host instead.
try {
  process.loadEnvFile()
} catch {
  // No .env file — rely on the real environment.
}

const optional = z
  .string()
  .trim()
  .optional()
  .transform((v) => v || undefined)

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),

  /** SQLite file location, e.g. file:./data/parijatk.db */
  DATABASE_URL: z.string().trim().default('file:./data/parijatk.db'),

  /** Comma-separated list of origins allowed to call the API from a browser. */
  CORS_ORIGINS: z.string().trim().default('http://localhost:5173'),

  /** Number of reverse proxies in front of the server (needed for correct rate limiting). */
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),

  /** Secret for the admin endpoints. While unset, those endpoints are disabled. */
  ADMIN_API_KEY: optional.refine((v) => !v || v.length >= 24, {
    message: 'ADMIN_API_KEY must be at least 24 characters',
  }),

  GOOGLE_SHEETS_ID: optional,
  GOOGLE_SERVICE_ACCOUNT_EMAIL: optional,
  GOOGLE_PRIVATE_KEY: optional,
  /** Where rows are appended. "A1" means the first tab; use e.g. "Enquiries!A1" for a named tab. */
  GOOGLE_SHEETS_RANGE: z.string().trim().default('A1'),

  WHATSAPP_NUMBER: z
    .string()
    .trim()
    .regex(/^\d{10,15}$/, 'WHATSAPP_NUMBER must be digits only, with country code')
    .default('917385087502'),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  // Report which variables are wrong without printing their values.
  const problems = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`)
  console.error(`Invalid environment configuration:\n${problems.join('\n')}`)
  process.exit(1)
}

export const env = {
  ...parsed.data,
  isProduction: parsed.data.NODE_ENV === 'production',
  corsOrigins: parsed.data.CORS_ORIGINS.split(',')
    .map((o) => o.trim())
    .filter(Boolean),
  // Hosting dashboards often store the key with literal "\n" sequences.
  googlePrivateKey: parsed.data.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
}
