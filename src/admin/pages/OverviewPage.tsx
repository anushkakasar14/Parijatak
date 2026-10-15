import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ApiError, adminFetch } from '../api'
import { useAuth } from '../AuthContext'
import {
  ConfirmDialog,
  EmptyState,
  ErrorNotice,
  LoadingBlock,
  Notice,
  PageHeader,
  Pill,
  PublicationBadge,
  StatusBadge,
  formatDate,
} from '../components'
import { useApi } from '../hooks'
import { enquiryStatuses } from '../types'
import type { Overview } from '../types'
import { cardClass, fieldClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../ui'

/** A date in India as YYYY-MM-DD, `offsetDays` from today. */
const indiaDate = (offsetDays = 0) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() + offsetDays * 86_400_000))

const presets = [
  { label: 'All time', from: () => '', to: () => '' },
  { label: 'Last 7 days', from: () => indiaDate(-6), to: () => indiaDate() },
  { label: 'Last 30 days', from: () => indiaDate(-29), to: () => indiaDate() },
  { label: 'This month', from: () => `${indiaDate().slice(0, 8)}01`, to: () => indiaDate() },
]

const quickActions = [
  { label: 'Add a product', to: '/admin/products', note: 'Products' },
  { label: 'Upload images', to: '/admin/media', note: 'Media library' },
  { label: 'Change the carousel', to: '/admin/carousel', note: 'Homepage' },
  { label: 'Add an offer', to: '/admin/offers', note: 'Offers & banners' },
]

interface SheetsHealth {
  ok: boolean
  mode: 'apps-script' | 'service-account' | null
  message: string
  sheetTitle?: string
  checkedAt: string
}

/**
 * Google Sheets status. "Connected" is shown only after Google has actually answered —
 * being set up is not the same as working.
 */
function SheetsCard({ sheets, onSynced }: { sheets: Overview['googleSheets']; onSynced: () => void }) {
  const { user } = useAuth()
  const [health, setHealth] = useState<SheetsHealth | null>(null)
  const [checking, setChecking] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const check = async () => {
    setChecking(true)
    try {
      setHealth(await adminFetch<SheetsHealth>('/admin/integrations/google-sheets'))
    } catch (err) {
      setHealth({
        ok: false,
        mode: sheets.mode,
        checkedAt: new Date().toISOString(),
        message: err instanceof ApiError ? err.message : 'The check could not be run.',
      })
    } finally {
      setChecking(false)
    }
  }

  // Check once when the dashboard opens, if there is anything to check.
  useEffect(() => {
    if (sheets.configured) void check()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sheets.configured])

  const retry = async () => {
    setBusy(true)
    setResult(null)
    try {
      const { synced, failed } = await adminFetch<{ synced: number; failed: number }>(
        '/enquiries/sync-sheet',
        { method: 'POST' },
      )
      setResult(
        failed
          ? {
              kind: 'error',
              text: `${synced} sent, ${failed} could not be sent. They are still saved here — check the Google Sheets setup and try again.`,
            }
          : { kind: 'ok', text: `${synced} ${synced === 1 ? 'enquiry' : 'enquiries'} sent to Google Sheets.` },
      )
      onSynced()
    } catch (err) {
      setResult({
        kind: 'error',
        text: err instanceof ApiError ? err.message : 'Something went wrong. Please try again.',
      })
    } finally {
      setBusy(false)
      setConfirming(false)
    }
  }

  const pill = !sheets.configured ? (
    <Pill tone="warn">Not set up</Pill>
  ) : checking || !health ? (
    <Pill>Checking…</Pill>
  ) : health.ok ? (
    <Pill tone="ok">Connected</Pill>
  ) : (
    <Pill tone="warn">Connection problem</Pill>
  )

  return (
    <section className={cardClass} aria-labelledby="sheets-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="sheets-heading" className="font-sans text-lg font-medium text-stone-900">
          Google Sheets
        </h2>
        {pill}
      </div>

      <div className="mt-2 space-y-2 text-stone-600" aria-live="polite">
        {!sheets.configured ? (
          <p>Google Sheets is not set up, so enquiries are not copied to a sheet. Every enquiry is still saved here.</p>
        ) : health && !checking ? (
          health.ok ? (
            <p>
              Google answered just now{health.sheetTitle ? ` — writing to “${health.sheetTitle}”` : ''}.
            </p>
          ) : (
            <p className="text-red-800">{health.message}</p>
          )
        ) : (
          <p>Asking Google…</p>
        )}
        {sheets.configured && (
          <p>
            {sheets.pending
              ? `${sheets.pending} ${sheets.pending === 1 ? 'enquiry has' : 'enquiries have'} not reached the sheet yet. They are safely saved here and can be sent again.`
              : 'Every enquiry has been copied to the sheet.'}
          </p>
        )}
      </div>

      {result && (
        <div className="mt-4">
          <Notice kind={result.kind}>{result.text}</Notice>
        </div>
      )}

      {sheets.configured && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button type="button" onClick={check} disabled={checking} className={secondaryButtonClass}>
            {checking ? 'Checking…' : 'Check connection'}
          </button>
          {sheets.pending > 0 && user?.role === 'admin' && (
            <button type="button" onClick={() => setConfirming(true)} className={primaryButtonClass}>
              Send waiting enquiries
            </button>
          )}
          {sheets.pending > 0 && (
            <Link to="/admin/enquiries?synced=false" className="text-sm font-medium text-maroon hover:underline">
              See which ones
            </Link>
          )}
        </div>
      )}

      <ConfirmDialog
        open={confirming}
        title="Send waiting enquiries to Google Sheets?"
        confirmLabel="Send now"
        busy={busy}
        onConfirm={retry}
        onCancel={() => setConfirming(false)}
      >
        <p>
          Up to 100 enquiries that are not in the sheet yet will be added as new rows. Enquiries
          already in the sheet are skipped, so nothing is duplicated.
        </p>
      </ConfirmDialog>
    </section>
  )
}

export function OverviewPage() {
  const { user } = useAuth()
  const [params, setParams] = useSearchParams()
  const from = params.get('from') ?? ''
  const to = params.get('to') ?? ''
  const setRange = (nextFrom: string, nextTo: string) => {
    const next = new URLSearchParams()
    if (nextFrom) next.set('from', nextFrom)
    if (nextTo) next.set('to', nextTo)
    setParams(next, { replace: true })
  }
  const query = new URLSearchParams({ ...(from && { from }), ...(to && { to }) }).toString()
  const { data, error, loading, reload } = useApi<Overview>(`/admin/overview${query ? `?${query}` : ''}`)

  const rangePicker = (
    <fieldset className={`${cardClass} mb-6 p-4`}>
      <legend className="sr-only">Enquiry dates</legend>
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Quick date ranges">
          {presets.map((preset) => {
            const active = preset.from() === from && preset.to() === to
            return (
              <button
                key={preset.label}
                type="button"
                aria-pressed={active}
                onClick={() => setRange(preset.from(), preset.to())}
                className={active ? primaryButtonClass : secondaryButtonClass}
              >
                {preset.label}
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="range-from" className={labelClass}>
              From
            </label>
            <input
              id="range-from"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setRange(e.target.value, to)}
              className={`${fieldClass} py-2`}
            />
          </div>
          <div>
            <label htmlFor="range-to" className={labelClass}>
              To
            </label>
            <input
              id="range-to"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setRange(from, e.target.value)}
              className={`${fieldClass} py-2`}
            />
          </div>
        </div>
      </div>
      <p className="mt-2 text-sm text-stone-500">The dates apply to the enquiry figures. Days follow India time.</p>
    </fieldset>
  )

  if (!data) {
    return (
      <>
        <PageHeader title="Overview" />
        {rangePicker}
        {error ? <ErrorNotice message={error} onRetry={reload} /> : <LoadingBlock />}
      </>
    )
  }

  const { enquiries, products, offers, googleSheets, recentEnquiries, recentProducts } = data
  const ranged = Boolean(from || to)

  return (
    <div aria-busy={loading}>
      <PageHeader
        title={`Welcome, ${user?.name ?? ''}`}
        description="A summary of customer enquiries and the website."
      />
      {rangePicker}
      {error && (
        <div className="mb-6">
          <ErrorNotice message={error} onRetry={reload} />
        </div>
      )}

      <ul className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {enquiryStatuses.map((status) => (
          <li key={status}>
            <Link
              to={`/admin/enquiries?status=${status}`}
              className={`${cardClass} block transition-colors hover:border-maroon`}
            >
              <StatusBadge status={status} />
              <p className="mt-3 text-3xl font-medium text-stone-900 tabular-nums">
                {enquiries.byStatus[status]}
              </p>
              <p className="text-sm text-stone-500">
                {enquiries.byStatus[status] === 1 ? 'enquiry' : 'enquiries'}
              </p>
            </Link>
          </li>
        ))}
      </ul>

      <dl className="mt-4 grid gap-4 sm:grid-cols-3">
        {[
          ranged ? ['Enquiries in these dates', enquiries.total] : ['Last 7 days', enquiries.last7Days],
          ['About a product', enquiries.productEnquiries],
          ['Products on the website', products.active],
        ].map(([label, value]) => (
          <div key={label} className={cardClass}>
            <dt className="text-sm text-stone-500">{label}</dt>
            <dd className="mt-1 text-2xl font-medium text-stone-900 tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            ['Published products', products.published, '/admin/products?status=published'],
            ['Draft products', products.draft, '/admin/products?status=draft'],
            ['Offers running now', offers.active, '/admin/offers'],
            ['Offers starting later', offers.scheduled, '/admin/offers'],
          ] as const
        ).map(([label, value, link]) => (
          <Link key={label} to={link} className={`${cardClass} block transition-colors hover:border-maroon`}>
            <p className="text-sm text-stone-500">{label}</p>
            <p className="mt-1 text-2xl font-medium text-stone-900 tabular-nums">{value}</p>
          </Link>
        ))}
      </div>

      {user?.role === 'admin' && (
        <section className="mt-6" aria-labelledby="quick-heading">
          <h2 id="quick-heading" className="font-sans text-lg font-medium text-stone-900">
            Quick actions
          </h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {quickActions.map((action) => (
              <li key={action.label}>
                <Link to={action.to} className={`${cardClass} block p-4 transition-colors hover:border-maroon`}>
                  <span className="block font-medium text-maroon">{action.label} →</span>
                  <span className="block text-sm text-stone-500">{action.note}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <section className={cardClass} aria-labelledby="recent-heading">
          <div className="flex items-center justify-between gap-3">
            <h2 id="recent-heading" className="font-sans text-lg font-medium text-stone-900">
              {ranged ? 'Latest enquiries in these dates' : 'Latest enquiries'}
            </h2>
            <Link to="/admin/enquiries" className="text-sm font-medium text-maroon hover:underline">
              View all
            </Link>
          </div>

          {recentEnquiries.length === 0 ? (
            <div className="mt-4">
              <EmptyState title="No enquiries yet">
                Enquiries sent from the website’s contact form will appear here.
              </EmptyState>
            </div>
          ) : (
            <ul className="mt-3 divide-y divide-stone-100">
              {recentEnquiries.map((enquiry) => (
                <li key={enquiry.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-stone-900">{enquiry.name}</p>
                    <p className="truncate text-sm text-stone-500">
                      {enquiry.productName ?? enquiry.inquiryType} · {formatDate(enquiry.createdAt)}
                    </p>
                  </div>
                  <StatusBadge status={enquiry.status} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <SheetsCard sheets={googleSheets} onSynced={reload} />
      </div>

      <section className={`${cardClass} mt-6`} aria-labelledby="products-heading">
        <div className="flex items-center justify-between gap-3">
          <h2 id="products-heading" className="font-sans text-lg font-medium text-stone-900">
            Recently changed products
          </h2>
          <Link to="/admin/products?sort=updated" className="text-sm font-medium text-maroon hover:underline">
            View all
          </Link>
        </div>
        {recentProducts.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="No products yet" />
          </div>
        ) : (
          <ul className="mt-3 divide-y divide-stone-100">
            {recentProducts.map((product) => (
              <li key={product.id} className="flex items-center gap-3 py-3">
                <img src={product.imageUrl} alt="" className="h-12 w-12 shrink-0 rounded bg-stone-100 object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-stone-900">{product.name}</p>
                  <p className="truncate text-sm text-stone-500">
                    {product.category} · {formatDate(product.updatedAt)}
                  </p>
                </div>
                <PublicationBadge status={product.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
