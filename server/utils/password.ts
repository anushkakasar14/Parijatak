import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import { env } from '../config/env.ts'

/**
 * Password hashing with scrypt (built into Node, so it also runs inside the Netlify function).
 * Parameters follow the OWASP recommendation N=2^15, r=8, p=3. Each hash stores its own
 * parameters, so they can be raised later without invalidating existing passwords.
 */
const COST = env.isTest ? 10 : 15 // log2(N); lowered only to keep the test suite fast
const BLOCK_SIZE = 8
const PARALLELISM = 3
const KEY_LENGTH = 64

export const PASSWORD_MIN_LENGTH = 12
export const PASSWORD_MAX_LENGTH = 128

function derive(password: string, salt: Buffer, cost: number, r: number, p: number, length: number) {
  return new Promise<Buffer>((resolve, reject) => {
    const N = 2 ** cost
    scrypt(
      password.normalize('NFKC'),
      salt,
      length,
      { N, r, p, maxmem: 256 * N * r },
      (err, key) => (err ? reject(err) : resolve(key)),
    )
  })
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await derive(password, salt, COST, BLOCK_SIZE, PARALLELISM, KEY_LENGTH)
  return ['scrypt', COST, BLOCK_SIZE, PARALLELISM, salt.toString('base64'), key.toString('base64')].join('$')
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, cost, r, p, salt, hash] = stored.split('$')
  if (scheme !== 'scrypt' || !salt || !hash) return false

  const expected = Buffer.from(hash, 'base64')
  const actual = await derive(
    password,
    Buffer.from(salt, 'base64'),
    Number(cost),
    Number(r),
    Number(p),
    expected.length,
  )
  return timingSafeEqual(actual, expected)
}

let dummyHash: Promise<string> | undefined

/**
 * Spends the same time as a real check when the account does not exist, so response
 * times do not reveal which email addresses belong to administrators.
 */
export async function verifyAgainstDummy(password: string): Promise<void> {
  dummyHash ??= hashPassword(randomBytes(24).toString('base64'))
  await verifyPassword(password, await dummyHash)
}

const COMMON_PASSWORDS = new Set([
  'password1234',
  'passwordpassword',
  '123456789012',
  'qwertyuiop12',
  'adminadmin12',
  'parijatak123',
  'parijatak1234',
])

/** Returns a reason the password is unacceptable, or null if it is fine. */
export function checkPasswordPolicy(password: string, email: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH)
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters`
  if (password.length > PASSWORD_MAX_LENGTH)
    return `Password must be at most ${PASSWORD_MAX_LENGTH} characters`

  const lower = password.toLowerCase()
  const localPart = email.split('@')[0]?.toLowerCase()
  if (COMMON_PASSWORDS.has(lower)) return 'This password is too common'
  if (localPart && localPart.length >= 4 && lower.includes(localPart))
    return 'Password must not contain your email address'
  if (new Set(password).size < 5) return 'Password is too repetitive'

  return null
}
