import { useState } from 'react'
import { Link } from 'react-router-dom'
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
  StatusBadge,
  formatDate,
} from '../components'
import { useApi } from '../hooks'
import { enquiryStatuses } from '../types'
import type { Overview } from '../types'
import { cardClass, primaryButtonClass } from '../ui'

function SheetsCard({ sheets, onSynced }: { sheets: Overview['googleSheets']; onSynced: () => void }) {
  const { user } = useAuth()
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

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

  return (
    <section className={cardClass} aria-labelledby="sheets-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="sheets-heading" className="font-sans text-lg font-medium text-slate-900">
          Google Sheets
        </h2>
        {!sheets.configured ? (
          <Pill tone="warn">Not connected</Pill>
        ) : sheets.pending ? (
          <Pill tone="warn">{sheets.pending} waiting</Pill>
        ) : (
          <Pill tone="ok">Up to date</Pill>
        )}
      </div>

      <p className="mt-2 text-slate-600">
        {!sheets.configured
          ? 'Google Sheets is not connected, so enquiries are not being copied to a sheet. Every enquiry is still saved here.'
          : sheets.pending
            ? `${sheets.pending} ${sheets.pending === 1 ? 'enquiry has' : 'enquiries have'} not reached the sheet yet. They are safely saved here and can be sent again.`
            : 'Every enquiry has been copied to the sheet.'}
      </p>

      {result && (
        <div className="mt-4">
          <Notice kind={result.kind}>{result.text}</Notice>
        </div>
      )}

      {sheets.configured && sheets.pending > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-4">
          {user?.role === 'admin' && (
            <button type="button" onClick={() => setConfirming(true)} className={primaryButtonClass}>
              Send to Google Sheets
            </button>
          )}
          <Link to="/admin/enquiries?synced=false" className="text-sm font-medium text-teal hover:underline">
            See which ones
          </Link>
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
  const { data, error, loading, reload } = useApi<Overview>('/admin/overview')

  if (!data) {
    return (
      <>
        <PageHeader title="Overview" />
        {error ? <ErrorNotice message={error} onRetry={reload} /> : <LoadingBlock />}
      </>
    )
  }

  const { enquiries, products, googleSheets, recentEnquiries } = data

  return (
    <div aria-busy={loading}>
      <PageHeader
        title={`Welcome, ${user?.name ?? ''}`}
        description="A summary of customer enquiries and the website."
      />
      {error && (
        <div className="mb-6">
          <ErrorNotice message={error} onRetry={reload} />
        </div>
      )}

      <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {enquiryStatuses.map((status) => (
          <li key={status}>
            <Link
              to={`/admin/enquiries?status=${status}`}
              className={`${cardClass} block transition-colors hover:border-teal`}
            >
              <StatusBadge status={status} />
              <p className="mt-3 text-3xl font-medium text-slate-900 tabular-nums">
                {enquiries.byStatus[status]}
              </p>
              <p className="text-sm text-slate-500">
                {enquiries.byStatus[status] === 1 ? 'enquiry' : 'enquiries'}
              </p>
            </Link>
          </li>
        ))}
      </ul>

      <dl className="mt-4 grid gap-4 sm:grid-cols-3">
        {[
          ['Last 7 days', enquiries.last7Days],
          ['About a product', enquiries.productEnquiries],
          ['Products on the website', products.active],
        ].map(([label, value]) => (
          <div key={label} className={cardClass}>
            <dt className="text-sm text-slate-500">{label}</dt>
            <dd className="mt-1 text-2xl font-medium text-slate-900 tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <section className={cardClass} aria-labelledby="recent-heading">
          <div className="flex items-center justify-between gap-3">
            <h2 id="recent-heading" className="font-sans text-lg font-medium text-slate-900">
              Latest enquiries
            </h2>
            <Link to="/admin/enquiries" className="text-sm font-medium text-teal hover:underline">
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
            <ul className="mt-3 divide-y divide-slate-100">
              {recentEnquiries.map((enquiry) => (
                <li key={enquiry.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">{enquiry.name}</p>
                    <p className="truncate text-sm text-slate-500">
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
    </div>
  )
}
