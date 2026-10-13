import { useEffect, useRef } from 'react'
import { NavLink } from 'react-router-dom'
import { navLinks } from '../config/site'
import { useSite } from '../context/SiteContext'
import { CloseIcon } from './Icons'
import { Swatches } from './Logo'

interface MobileMenuProps {
  open: boolean
  onClose: () => void
}

export function MobileMenu({ open, onClose }: MobileMenuProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const { settings } = useSite()

  // Native <dialog> gives us focus trapping, Escape-to-close and focus restoration.
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={dialogRef}
      id="mobile-menu"
      aria-label="Menu"
      onClose={onClose}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="m-0 h-dvh max-h-none w-[min(22rem,86vw)] max-w-none bg-ivory text-ink backdrop:bg-ink/50"
    >
      <div className="flex h-full flex-col p-6">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close menu"
          className="-ml-2.5 grid h-11 w-11 place-items-center"
        >
          <CloseIcon />
        </button>

        <nav aria-label="Main" className="mt-10">
          <ul className="space-y-1">
            {navLinks.map(({ label, to }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end
                  onClick={onClose}
                  className={({ isActive }) =>
                    `block py-2 font-display text-4xl ${isActive ? 'text-teal italic' : ''}`
                  }
                >
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mt-auto">
          <Swatches />
          <p className="mt-4 text-sm text-muted">{settings.brand.tagline}</p>
        </div>
      </div>
    </dialog>
  )
}
