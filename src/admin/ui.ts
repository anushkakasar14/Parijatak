/** Shared class names for the admin panel — a plain dashboard look, separate from the public site. */

export const labelClass = 'block text-sm font-medium text-stone-700'

export const fieldClass =
  'mt-1.5 block w-full rounded-md border border-stone-300 bg-white px-3 py-2.5 text-base text-stone-900 focus:border-maroon'

const buttonBase =
  'inline-flex min-h-11 items-center justify-center rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60'

export const primaryButtonClass = `${buttonBase} bg-maroon text-white hover:bg-maroon-deep`

export const secondaryButtonClass = `${buttonBase} border border-stone-300 bg-white text-stone-700 hover:bg-stone-50`

export const cardClass = 'rounded-lg border border-stone-200 bg-white p-6 shadow-sm'
