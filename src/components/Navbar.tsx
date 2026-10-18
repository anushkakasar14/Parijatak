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
      <div className="grid h-20 w-full grid-cols-[1fr_auto_1fr] items-center md:h-24">
        {/* The button's own padding is subtracted so the menu lines themselves start 1 cm from the screen edge */}
        <div className="flex items-center pl-[calc(1cm-13px)] md:pl-[calc(1cm-12px)]">
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
            aria-haspopup="dialog"
            aria-controls="mobile-menu"
            className="grid h-11 w-11 place-items-center rounded-full transition-colors hover:bg-cream hover:text-maroon md:h-12 md:w-12"
          >
            <MenuIcon className="h-6 w-6 md:h-8 md:w-8" />
          </button>
        </div>

        <Link to="/" aria-label="Parijatak — home" className="flex items-center">
          <Logo />
        </Link>

        {/* Mirrors the menu button: its right edge sits 1 cm from the screen edge */}
        <div className="flex items-center justify-end pr-[1cm]">
          <Link
            to="/about"
            className="inline-flex min-h-11 items-center rounded-full border border-maroon bg-maroon px-3 text-[0.6875rem] font-medium tracking-[0.16em] text-ivory uppercase transition-colors duration-300 hover:border-maroon-deep hover:bg-maroon-deep sm:px-5 sm:text-xs sm:tracking-[0.22em]"
          >
            Blogs
          </Link>
        </div>
      </div>

      <MobileMenu open={menuOpen} onClose={closeMenu} />
    </header>
  )
}
