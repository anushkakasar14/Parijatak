import { useCallback, useState } from 'react'
import { Link } from 'react-router-dom'
import { MenuIcon } from './Icons'
import { Logo } from './Logo'
import { MobileMenu } from './MobileMenu'

export function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const closeMenu = useCallback(() => setMenuOpen(false), [])

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ivory">
      {/* 1fr / auto / 1fr keeps the logo optically centred whatever sits either side */}
      <div className="container-page grid h-20 grid-cols-[1fr_auto_1fr] items-center md:h-24">
        <div className="flex items-center">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-haspopup="dialog"
            aria-controls="mobile-menu"
            className="-ml-2.5 grid h-11 w-11 place-items-center rounded-full transition-colors hover:bg-cream hover:text-maroon md:h-12 md:w-12"
          >
            <MenuIcon className="h-6 w-6 md:h-8 md:w-8" />
          </button>
        </div>

        <Link to="/" aria-label="Parijatak — home" className="flex items-center">
          <Logo />
        </Link>

        <div aria-hidden="true" />
      </div>

      <MobileMenu open={menuOpen} onClose={closeMenu} />
    </header>
  )
}
