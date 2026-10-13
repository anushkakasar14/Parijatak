import { createHash, createHmac, randomBytes } from 'node:crypto'
import { env } from '../config/env.ts'
import { adminSessionModel } from '../models/adminSessionModel.ts'
import type { AdminSession } from '../models/adminSessionModel.ts'
import { adminUserModel, toPublicAdmin } from '../models/adminUserModel.ts'
import type { AdminRole, AdminUser } from '../models/adminUserModel.ts'
import { loginAttemptModel } from '../models/loginAttemptModel.ts'
import { HttpError } from '../utils/httpError.ts'
import { errorMessage, logger } from '../utils/logger.ts'
import {
  checkPasswordPolicy,
  hashPassword,
  verifyAgainstDummy,
  verifyPassword,
} from '../utils/password.ts'

/** Failed sign-ins are counted over this window. */
const THROTTLE_WINDOW_MINUTES = 15
/** …from one address against one account (the usual "wrong password" case). */
const MAX_FAILURES_PER_PAIR = 5
/** …from one address against any account. */
const MAX_FAILURES_PER_IP = 20
/** …against one account from anywhere (slows attacks spread over many addresses). */
const MAX_FAILURES_PER_EMAIL = 30

/** Sessions are re-stamped at most this often, to avoid a database write on every request. */
const TOUCH_INTERVAL_MS = 60_000

// Deliberately identical for "no such account", "wrong password" and "account disabled".
const INVALID_CREDENTIALS = 'Incorrect email or password.'

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

/**
 * The CSRF token is derived from the session token, so it needs no storage and cannot be
 * computed by anyone who does not already hold the (HttpOnly) session cookie.
 */
export const csrfTokenFor = (sessionToken: string) =>
  createHmac('sha256', sessionToken).update('parijatak-admin-csrf').digest('base64url')

export interface SignedIn {
  /** Raw session token — goes into the HttpOnly cookie and nowhere else. */
  token: string
  csrfToken: string
  expiresAt: string
  user: AdminUser
}

export const authService = {
  async login(
    email: string,
    password: string,
    context: { ipAddress: string; userAgent: string | null },
  ): Promise<SignedIn> {
    const failures = await loginAttemptModel.countRecentFailures(
      email,
      context.ipAddress,
      THROTTLE_WINDOW_MINUTES,
    )
    if (
      failures.pair >= MAX_FAILURES_PER_PAIR ||
      failures.ip >= MAX_FAILURES_PER_IP ||
      failures.email >= MAX_FAILURES_PER_EMAIL
    ) {
      logger.warn('Admin sign-in throttled', { ipAddress: context.ipAddress })
      throw new HttpError(
        429,
        `Too many sign-in attempts. Please wait ${THROTTLE_WINDOW_MINUTES} minutes and try again.`,
      )
    }

    const user = await adminUserModel.findByEmail(email)
    let valid = false
    if (user) valid = await verifyPassword(password, user.passwordHash)
    else await verifyAgainstDummy(password)

    if (!user || !valid || !user.isActive) {
      await loginAttemptModel.record(email, context.ipAddress, false)
      throw new HttpError(401, INVALID_CREDENTIALS)
    }

    await loginAttemptModel.record(email, context.ipAddress, true)

    // A brand-new random token on every sign-in (no session fixation). Only its hash is stored.
    const token = randomBytes(32).toString('base64url')
    const session = await adminSessionModel.create({
      userId: user.id,
      tokenHash: sha256(token),
      maxHours: env.ADMIN_SESSION_MAX_HOURS,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
    })
    await adminUserModel.recordLogin(user.id)

    // Housekeeping. Awaited (a serverless function may be frozen the moment it responds),
    // but a failure here must not block the sign-in.
    try {
      await adminSessionModel.deleteExpired(env.ADMIN_SESSION_IDLE_MINUTES)
      await loginAttemptModel.deleteOld()
    } catch (err) {
      logger.warn('Session housekeeping failed', { error: errorMessage(err) })
    }

    logger.info('Admin signed in', { adminId: user.id })
    return {
      token,
      csrfToken: csrfTokenFor(token),
      expiresAt: session.expiresAt,
      user: toPublicAdmin(user),
    }
  },

  /** Resolves a session cookie value to a live session, or null. */
  async authenticate(token: string): Promise<AdminSession | null> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null

    const session = await adminSessionModel.findValid(sha256(token), env.ADMIN_SESSION_IDLE_MINUTES)
    if (!session) return null

    if (Date.now() - new Date(session.lastSeenAt).getTime() > TOUCH_INTERVAL_MS) {
      await adminSessionModel.touch(session.id)
    }
    return session
  },

  async logout(sessionId: string): Promise<void> {
    await adminSessionModel.delete(sessionId)
  },

  /** Changes the password and signs the administrator out of every other session. */
  async changePassword(
    session: AdminSession,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await adminUserModel.findById(session.user.id)
    if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new HttpError(400, 'Please check the details you entered.', {
        currentPassword: 'Current password is incorrect',
      })
    }

    const problem = checkPasswordPolicy(newPassword, user.email)
    if (problem) {
      throw new HttpError(400, 'Please check the details you entered.', { newPassword: problem })
    }

    await adminUserModel.setPassword(user.id, await hashPassword(newPassword))
    await adminSessionModel.deleteForUser(user.id, session.id)
    logger.info('Admin changed password', { adminId: user.id })
  },

  // ── Provisioning: used by the command-line script only, never exposed over HTTP ──

  async createAdmin(input: { email: string; name: string; password: string; role: AdminRole }) {
    const problem = checkPasswordPolicy(input.password, input.email)
    if (problem) throw new Error(problem)
    if (await adminUserModel.findByEmail(input.email)) {
      throw new Error('An administrator with this email already exists')
    }
    const user = await adminUserModel.create({
      email: input.email,
      name: input.name,
      role: input.role,
      passwordHash: await hashPassword(input.password),
    })
    return toPublicAdmin(user)
  },

  /** Password recovery: sets a new password and ends all of the account's sessions. */
  async resetPassword(email: string, newPassword: string): Promise<void> {
    const user = await adminUserModel.findByEmail(email)
    if (!user) throw new Error('No administrator with this email')
    const problem = checkPasswordPolicy(newPassword, user.email)
    if (problem) throw new Error(problem)

    await adminUserModel.setPassword(user.id, await hashPassword(newPassword))
    await adminSessionModel.deleteForUser(user.id)
  },

  async setActive(email: string, isActive: boolean): Promise<void> {
    const user = await adminUserModel.findByEmail(email)
    if (!user) throw new Error('No administrator with this email')
    await adminUserModel.setActive(user.id, isActive)
    if (!isActive) await adminSessionModel.deleteForUser(user.id)
  },
}
