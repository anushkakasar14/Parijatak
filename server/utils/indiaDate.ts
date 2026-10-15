/** Date filters in the admin are whole days in India Standard Time (UTC+5:30, no DST). */

/** The first instant of a YYYY-MM-DD day in India. */
export const startOfIndiaDay = (day: string) => new Date(`${day}T00:00:00+05:30`)

/** The first instant of the day after — use as an exclusive upper bound. */
export const startOfNextIndiaDay = (day: string) => new Date(startOfIndiaDay(day).getTime() + 24 * 60 * 60 * 1000)

/** A day range as instants: `from` inclusive, `to` exclusive (the whole of the last day is included). */
export const indiaDayRange = (range: { from?: string; to?: string }) => ({
  from: range.from ? startOfIndiaDay(range.from) : undefined,
  to: range.to ? startOfNextIndiaDay(range.to) : undefined,
})

/** e.g. "2026-10-12 15:42" in India time — readable and sorts correctly as text. */
export const formatIndiaDateTime = (iso: string) =>
  new Date(iso).toLocaleString('sv-SE', { timeZone: 'Asia/Kolkata', hour12: false }).slice(0, 16)
