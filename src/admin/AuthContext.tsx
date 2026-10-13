import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { adminFetch, setCsrfToken, setSessionListeners } from './api'

export interface AdminUser {
  id: string
  email: string
  name: string
  role: 'admin' | 'viewer'
}

interface SessionInfo {
  user: AdminUser
  csrfToken: string
  expiresAt: string
  idleTimeoutMinutes: number
}

type Status = 'loading' | 'signedOut' | 'signedIn'

interface AuthState {
  status: Status
  user: AdminUser | null
  /** True when the previous session ended on its own, so the login page can say why. */
  sessionExpired: boolean
  /** True when the administrator chose to sign out (the next sign-in starts at the overview). */
  signedOutByChoice: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function useAuth(): AuthState {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('loading')
  const [user, setUser] = useState<AdminUser | null>(null)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [signedOutByChoice, setSignedOutByChoice] = useState(false)

  const session = useRef<SessionInfo | null>(null)
  const idleTimer = useRef<number | undefined>(undefined)
  const absoluteTimer = useRef<number | undefined>(undefined)

  const clear = useCallback((expired: boolean, byChoice = false) => {
    window.clearTimeout(idleTimer.current)
    window.clearTimeout(absoluteTimer.current)
    session.current = null
    setCsrfToken(null)
    setUser(null)
    setSessionExpired(expired)
    setSignedOutByChoice(byChoice)
    setStatus('signedOut')
  }, [])

  /**
   * The server ends a session after a period of inactivity. Mirror that here so the
   * screen locks at the same moment — without polling, which would itself count as activity.
   */
  const restartIdleTimer = useCallback(() => {
    const current = session.current
    if (!current) return
    window.clearTimeout(idleTimer.current)
    idleTimer.current = window.setTimeout(() => clear(true), current.idleTimeoutMinutes * 60_000)
  }, [clear])

  const start = useCallback(
    (info: SessionInfo) => {
      session.current = info
      setCsrfToken(info.csrfToken)
      setUser(info.user)
      setSessionExpired(false)
      setStatus('signedIn')

      restartIdleTimer()
      window.clearTimeout(absoluteTimer.current)
      const untilExpiry = new Date(info.expiresAt).getTime() - Date.now()
      // setTimeout cannot wait longer than ~24.8 days; sessions are far shorter than that.
      absoluteTimer.current = window.setTimeout(() => clear(true), Math.max(untilExpiry, 0))
    },
    [clear, restartIdleTimer],
  )

  // Restore the session after a page load or refresh.
  useEffect(() => {
    let cancelled = false
    adminFetch<SessionInfo>('/admin/auth/session', { notifyOnUnauthorized: false })
      .then((info) => !cancelled && start(info))
      .catch(() => !cancelled && clear(false))
    return () => {
      cancelled = true
    }
  }, [start, clear])

  useEffect(() => {
    setSessionListeners({ unauthorized: () => clear(true), activity: restartIdleTimer })
    return () => setSessionListeners(null)
  }, [clear, restartIdleTimer])

  const login = useCallback(
    async (email: string, password: string) => {
      const info = await adminFetch<SessionInfo>('/admin/auth/login', {
        method: 'POST',
        body: { email, password },
        notifyOnUnauthorized: false,
      })
      start(info)
    },
    [start],
  )

  const logout = useCallback(async () => {
    try {
      await adminFetch('/admin/auth/logout', { method: 'POST', notifyOnUnauthorized: false })
    } finally {
      // Whatever the server said, this browser is signed out.
      clear(false, true)
    }
  }, [clear])

  const value = useMemo(
    () => ({ status, user, sessionExpired, signedOutByChoice, login, logout }),
    [status, user, sessionExpired, signedOutByChoice, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
