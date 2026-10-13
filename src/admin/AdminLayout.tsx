import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext'
import { Pill } from './components'
import { secondaryButtonClass } from './ui'

interface NavItem {
  label: string
  to: string
  /** Sections whose editing tools are not built yet. */
  upcoming?: boolean
}

const navGroups: { heading: string; items: NavItem[] }[] = [
  {
    heading: 'Manage',
    items: [
      { label: 'Overview', to: '/admin' },
      { label: 'Enquiries', to: '/admin/enquiries' },
    ],
  },
  {
    heading: 'Website content',
    items: [
      { label: 'Products', to: '/admin/products' },
      { label: 'Homepage carousel', to: '/admin/carousel', upcoming: true },
      { label: 'Offers & banners', to: '/admin/offers', upcoming: true },
      { label: 'Homepage & About', to: '/admin/content', upcoming: true },
      { label: 'Contact & social', to: '/admin/contact-details', upcoming: true },
    ],
  },
  {
    heading: 'Settings',
    items: [{ label: 'Account', to: '/admin/account' }],
  },
]

function Navigation({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <nav aria-label="Admin" className="space-y-6">
      {navGroups.map((group) => (
        <div key={group.heading}>
          <p className="px-3 text-xs font-medium tracking-wider text-slate-400 uppercase">
            {group.heading}
          </p>
          <ul className="mt-2 space-y-0.5">
            {group.items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.to === '/admin'}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `flex min-h-10 items-center justify-between gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
                      isActive
                        ? 'bg-teal text-white'
                        : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
                    }`
                  }
                >
                  {item.label}
                  {item.upcoming && <Pill>Soon</Pill>}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  )
}

function Brand() {
  return (
    <Link to="/admin" className="block text-sm font-medium tracking-[0.18em] text-teal uppercase">
      Parijatak <span className="text-slate-400">Admin</span>
    </Link>
  )
}

/** Signed-in frame: sidebar on wide screens, slide-in menu on narrow ones. */
export function AdminLayout() {
  const { user, logout } = useAuth()
  const { pathname } = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const drawer = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = drawer.current
    if (!dialog) return
    if (menuOpen && !dialog.open) dialog.showModal()
    if (!menuOpen && dialog.open) dialog.close()
  }, [menuOpen])

  // Start each section at the top.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' })
  }, [pathname])

  if (!user) return null

  const onLogout = async () => {
    setSigningOut(true)
    await logout()
  }

  return (
    <div className="min-h-svh lg:pl-64">
      <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-16 items-center border-b border-slate-200 px-6">
          <Brand />
        </div>
        <div className="flex-1 overflow-y-auto p-3 pt-5">
          <Navigation />
        </div>
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="border-t border-slate-200 px-6 py-4 text-sm text-slate-600 hover:text-teal"
        >
          View website ↗
        </a>
      </aside>

      <dialog
        ref={drawer}
        aria-label="Admin menu"
        onClose={() => setMenuOpen(false)}
        onClick={(e) => e.target === e.currentTarget && setMenuOpen(false)}
        className="m-0 h-dvh max-h-none w-[min(18rem,85vw)] max-w-none bg-white p-0 font-sans text-slate-800 backdrop:bg-slate-900/50 lg:hidden"
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5">
          <Brand />
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            aria-label="Close menu"
            className="-mr-2 grid h-10 w-10 place-items-center rounded-md text-slate-500 hover:bg-slate-100"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
              <path d="M5 5l14 14M19 5L5 19" />
            </svg>
          </button>
        </div>
        <div className="p-3 pt-5">
          <Navigation onNavigate={() => setMenuOpen(false)} />
        </div>
      </dialog>

      <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-haspopup="dialog"
            className="-ml-2 grid h-10 w-10 place-items-center rounded-md text-slate-600 hover:bg-slate-100 lg:hidden"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
              <path d="M3 7h18M3 12h18M3 17h18" />
            </svg>
          </button>
          <div className="lg:hidden">
            <Brand />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <p className="hidden text-sm text-slate-600 sm:block">
            {user.name} <span className="text-slate-400">· {user.role}</span>
          </p>
          <button type="button" onClick={onLogout} disabled={signingOut} className={secondaryButtonClass}>
            {signingOut ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  )
}
