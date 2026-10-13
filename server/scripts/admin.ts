/**
 * Administrator provisioning and recovery. Run from a trusted machine that has
 * DATABASE_URL set — there is no way to do any of this over the public API.
 *
 *   npm run admin -- create --email you@example.com --name "Your Name" [--role admin|viewer]
 *   npm run admin -- reset-password --email you@example.com
 *   npm run admin -- deactivate --email you@example.com
 *   npm run admin -- activate --email you@example.com
 *   npm run admin -- list
 *
 * Passwords are typed at a hidden prompt, or add --generate to have a strong one
 * created and shown once.
 */
import { randomBytes } from 'node:crypto'
import { createInterface } from 'node:readline'
import { Writable } from 'node:stream'
import { z } from 'zod'
import { closeDb } from '../config/database.ts'
import { env } from '../config/env.ts'
import { adminRoles, adminUserModel } from '../models/adminUserModel.ts'
import { authService } from '../services/authService.ts'
import { PASSWORD_MIN_LENGTH } from '../utils/password.ts'

const [command, ...rest] = process.argv.slice(2)

function option(name: string): string | undefined {
  const index = rest.indexOf(`--${name}`)
  return index >= 0 ? rest[index + 1] : undefined
}
const flag = (name: string) => rest.includes(`--${name}`)

/** Reads a line without echoing it to the terminal. */
function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const silent = new Writable({ write: (_chunk, _encoding, done) => done() })
    const rl = createInterface({
      input: process.stdin,
      output: process.stdin.isTTY ? silent : undefined,
      terminal: process.stdin.isTTY,
    })
    process.stdout.write(question)
    rl.question('', (answer) => {
      rl.close()
      process.stdout.write('\n')
      resolve(answer)
    })
  })
}

async function choosePassword(): Promise<{ password: string; generated: boolean }> {
  if (flag('generate')) {
    return { password: randomBytes(18).toString('base64url'), generated: true }
  }
  const password = await promptHidden(`New password (at least ${PASSWORD_MIN_LENGTH} characters): `)
  // Piped input (non-interactive use) supplies the password once.
  if (process.stdin.isTTY) {
    const again = await promptHidden('Repeat password: ')
    if (password !== again) throw new Error('The two passwords do not match')
  }
  return { password, generated: false }
}

function requireEmail(): string {
  const parsed = z.email().safeParse(option('email')?.trim().toLowerCase())
  if (!parsed.success) throw new Error('Provide a valid address with --email')
  return parsed.data
}

function showGenerated(password: string) {
  console.log(`\nGenerated password (shown once — store it in a password manager):\n\n  ${password}\n`)
}

async function main() {
  console.log(`Database: ${env.DATABASE_URL ? 'PostgreSQL (DATABASE_URL)' : 'local development database'}`)

  switch (command) {
    case 'create': {
      const email = requireEmail()
      const name = option('name')?.trim()
      if (!name) throw new Error('Provide the administrator\'s name with --name "Full Name"')
      const role = z.enum(adminRoles).default('admin').parse(option('role'))

      const { password, generated } = await choosePassword()
      const user = await authService.createAdmin({ email, name, password, role })
      console.log(`Created ${user.role} account for ${user.email}`)
      if (generated) showGenerated(password)
      break
    }

    case 'reset-password': {
      const email = requireEmail()
      const { password, generated } = await choosePassword()
      await authService.resetPassword(email, password)
      console.log(`Password reset for ${email}. All of this account's sessions were signed out.`)
      if (generated) showGenerated(password)
      break
    }

    case 'deactivate':
    case 'activate': {
      const email = requireEmail()
      await authService.setActive(email, command === 'activate')
      console.log(`${email} is now ${command === 'activate' ? 'active' : 'deactivated and signed out'}`)
      break
    }

    case 'list': {
      const users = await adminUserModel.list()
      if (!users.length) console.log('No administrators yet. Create one with: npm run admin -- create …')
      for (const u of users) {
        const lastLogin = u.lastLoginAt ? `last sign-in ${u.lastLoginAt}` : 'never signed in'
        console.log(`${u.email}  ${u.role}  ${u.isActive ? 'active' : 'DEACTIVATED'}  ${lastLogin}`)
      }
      break
    }

    default:
      console.log('Commands: create, reset-password, deactivate, activate, list (see README, "Administrators")')
      process.exitCode = 1
  }
}

try {
  await main()
} catch (err) {
  console.error(`Error: ${err instanceof Error ? err.message : String(err)}`)
  process.exitCode = 1
} finally {
  await closeDb().catch(() => {})
}
