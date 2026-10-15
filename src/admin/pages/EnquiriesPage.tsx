import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ApiError, adminFetch } from '../api'
import { useAuth } from '../AuthContext'
import { copyText } from '../clipboard'
import {
  Dialog,
  EmptyState,
  ErrorNotice,
  LoadingBlock,
  Notice,
  PageHeader,
  Pill,
  StatusBadge,
  formatDate,
} from '../components'
import { useApi, useDebounced } from '../hooks'
import { enquiryStatusLabels, enquiryStatuses, inquiryTypes } from '../types'
import type { Enquiry, EnquiryStatus, Paginated } from '../types'
import { fieldClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../ui'

const PAGE_SIZE = 20

/** Filters live in the URL, so they survive a refresh and can be linked to. */
const FILTER_KEYS = ['search', 'status', 'inquiryType', 'hasProduct', 'synced', 'from', 'to'] as const

/** A small button that copies text and briefly confirms it. */
function CopyButton({ text, label }: { text: string; label: string }) {
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const copy = async (e: React.MouseEvent<HTMLButtonElement>) => {
    setState((await copyText(text, e.currentTarget)) ? 'copied' : 'failed')
    window.setTimeout(() => setState('idle'), 2000)
  }
  return (
    <button
      type="button"
      onClick={copy}
      className="rounded px-1.5 py-0.5 text-sm text-stone-500 ring-1 ring-stone-200 hover:bg-stone-50 hover:text-stone-800"
    >
      <span aria-live="polite">{state === 'copied' ? 'Copied' : state === 'failed' ? 'Copy failed' : label}</span>
    </button>
  )
}

function EnquiryDetail({
  enquiry,
  onClose,
  onUpdated,
}: {
  enquiry: Enquiry
  onClose: () => void
  onUpdated: (updated: Enquiry) => void
}) {
  const { user } = useAuth()
  const canEdit = user?.role === 'admin'
  const [status, setStatus] = useState<EnquiryStatus>(enquiry.status)
  const [notes, setNotes] = useState(enquiry.internalNotes ?? '')
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const changed = status !== enquiry.status || notes.trim() !== (enquiry.internalNotes ?? '')

  const save = async () => {
    setSaving(true)
    setResult(null)
    try {
      const updated = await adminFetch<Enquiry>(`/enquiries/${enquiry.id}`, {
        method: 'PATCH',
        body: { status, internalNotes: notes },
      })
      onUpdated(updated)
      setNotes(updated.internalNotes ?? '')
      setResult({ kind: 'ok', text: 'Saved.' })
    } catch (err) {
      setResult({
        kind: 'error',
        text: err instanceof ApiError ? err.message : 'Could not save. Please try again.',
      })
    } finally {
      setSaving(false)
    }
  }

  const whatsappNumber = enquiry.phone.replace(/\D/g, '')
  const linkClass = 'font-medium text-maroon hover:underline'
  const summary = [
    `Name: ${enquiry.name}`,
    `Email: ${enquiry.email}`,
    `Phone: ${enquiry.phone}`,
    `About: ${enquiry.inquiryType}${enquiry.productName ? ` — ${enquiry.productName}` : ''}`,
    `Received: ${formatDate(enquiry.createdAt)}`,
    '',
    enquiry.message,
  ].join('\n')

  return (
    <Dialog open onClose={onClose} title={`Enquiry from ${enquiry.name}`} width="max-w-2xl">
      <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
        <div>
          <dt className="text-sm text-stone-500">Received</dt>
          <dd>{formatDate(enquiry.createdAt)}</dd>
        </div>
        <div>
          <dt className="text-sm text-stone-500">About</dt>
          <dd>
            {enquiry.inquiryType}
            {enquiry.productName && ` — ${enquiry.productName}`}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-stone-500">Email</dt>
          <dd className="flex flex-wrap items-center gap-x-3 gap-y-1 break-all">
            <a href={`mailto:${enquiry.email}`} className={linkClass}>
              {enquiry.email}
            </a>
            <CopyButton text={enquiry.email} label="Copy" />
          </dd>
        </div>
        <div>
          <dt className="text-sm text-stone-500">Contact number</dt>
          <dd className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <a href={`tel:${enquiry.phone}`} className={linkClass}>
              {enquiry.phone}
            </a>
            <CopyButton text={enquiry.phone} label="Copy" />
            <a
              href={`https://wa.me/${whatsappNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className={linkClass}
            >
              WhatsApp ↗
            </a>
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="flex items-center justify-between gap-3 text-sm text-stone-500">
            Message
            <CopyButton text={summary} label="Copy all details" />
          </dt>
          <dd className="mt-1 rounded-md bg-stone-50 p-3 break-words whitespace-pre-wrap">
            {enquiry.message}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-sm text-stone-500">Google Sheets</dt>
          <dd>
            {enquiry.sheetSyncedAt ? (
              `Copied to the sheet on ${formatDate(enquiry.sheetSyncedAt)}`
            ) : (
              <>
                Not in the sheet yet.
                {enquiry.sheetSyncError && (
                  <span className="block text-sm text-red-700">Last attempt failed: {enquiry.sheetSyncError}</span>
                )}
              </>
            )}
          </dd>
        </div>
      </dl>

      <div className="mt-6 space-y-4 border-t border-stone-200 pt-5">
        {canEdit ? (
          <>
            <div>
              <label htmlFor="enquiry-status" className={labelClass}>
                Status
              </label>
              <select
                id="enquiry-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as EnquiryStatus)}
                className={fieldClass}
              >
                {enquiryStatuses.map((s) => (
                  <option key={s} value={s}>
                    {enquiryStatusLabels[s]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="enquiry-notes" className={labelClass}>
                Internal notes
              </label>
              <textarea
                id="enquiry-notes"
                rows={4}
                maxLength={2000}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                aria-describedby="enquiry-notes-hint"
                className={fieldClass}
              />
              <p id="enquiry-notes-hint" className="mt-1.5 text-sm text-stone-500">
                Only visible in the admin panel — for example when you called and what was agreed.
              </p>
            </div>
            {result && <Notice kind={result.kind}>{result.text}</Notice>}
            <button type="button" onClick={save} disabled={saving || !changed} className={primaryButtonClass}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </>
        ) : (
          <>
            <p className="flex items-center gap-3 text-stone-600">
              Status <StatusBadge status={enquiry.status} />
            </p>
            {enquiry.internalNotes && (
              <div>
                <p className="text-sm text-stone-500">Internal notes</p>
                <p className="mt-1 whitespace-pre-wrap">{enquiry.internalNotes}</p>
              </div>
            )}
            <p className="text-sm text-stone-500">Your account can view enquiries but not change them.</p>
          </>
        )}
      </div>
    </Dialog>
  )
}

export function EnquiriesPage() {
  const [params, setParams] = useSearchParams()
  const [searchText, setSearchText] = useState(params.get('search') ?? '')
  const debouncedSearch = useDebounced(searchText)
  const [selected, setSelected] = useState<Enquiry | null>(null)

  const page = Math.max(1, Number(params.get('page')) || 1)

  /** Sets or clears one filter and returns to the first page. */
  const setFilter = (key: string, value: string) => {
    // From the address bar, which is always current, so quick changes cannot undo each other.
    const next = new URLSearchParams(window.location.search)
    if (value) next.set(key, value)
    else next.delete(key)
    next.delete('page')
    setParams(next, { replace: true })
  }

  // Push the search box into the URL once typing pauses.
  useEffect(() => {
    if (debouncedSearch.trim() !== (params.get('search') ?? '')) setFilter('search', debouncedSearch.trim())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch])

  const query = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String((page - 1) * PAGE_SIZE) })
  for (const key of FILTER_KEYS) {
    const value = params.get(key)
    if (value) query.set(key, value)
  }

  const { data, error, loading, reload, setData } = useApi<Paginated<Enquiry>>(`/enquiries?${query}`, {
    raw: true,
  })

  const hasFilters = FILTER_KEYS.some((key) => params.get(key))
  // The same filters, without paging: the file holds every matching enquiry (up to 5,000).
  const exportQuery = new URLSearchParams(
    FILTER_KEYS.flatMap((key) => (params.get(key) ? [[key, params.get(key)!]] : [])),
  ).toString()
  const total = data?.pagination.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const goToPage = (target: number) => {
    const next = new URLSearchParams(window.location.search)
    if (target > 1) next.set('page', String(target))
    else next.delete('page')
    setParams(next)
  }

  const onUpdated = (updated: Enquiry) => {
    setSelected(updated)
    setData((current) => ({
      ...current,
      data: current.data.map((e) => (e.id === updated.id ? updated : e)),
    }))
  }

  const selectClass = `${fieldClass} mt-0`

  return (
    <>
      <PageHeader
        title="Enquiries"
        description="Every enquiry sent through the website, newest first."
      />

      <form
        role="search"
        onSubmit={(e) => e.preventDefault()}
        className="mb-5 grid gap-3 rounded-lg border border-stone-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_1fr]"
      >
        <div>
          <label htmlFor="filter-search" className="sr-only">
            Search enquiries
          </label>
          <input
            id="filter-search"
            type="search"
            placeholder="Search name, email, phone or message"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className={selectClass}
          />
        </div>
        <div>
          <label htmlFor="filter-status" className="sr-only">
            Status
          </label>
          <select
            id="filter-status"
            value={params.get('status') ?? ''}
            onChange={(e) => setFilter('status', e.target.value)}
            className={selectClass}
          >
            <option value="">All statuses</option>
            {enquiryStatuses.map((s) => (
              <option key={s} value={s}>
                {enquiryStatusLabels[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="filter-type" className="sr-only">
            Inquiry type
          </label>
          <select
            id="filter-type"
            value={params.get('inquiryType') ?? ''}
            onChange={(e) => setFilter('inquiryType', e.target.value)}
            className={selectClass}
          >
            <option value="">All types</option>
            {inquiryTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="filter-product" className="sr-only">
            Product or general
          </label>
          <select
            id="filter-product"
            value={params.get('hasProduct') ?? ''}
            onChange={(e) => setFilter('hasProduct', e.target.value)}
            className={selectClass}
          >
            <option value="">Product and general</option>
            <option value="true">About a product</option>
            <option value="false">General only</option>
          </select>
        </div>
        <div>
          <label htmlFor="filter-sync" className="sr-only">
            Google Sheets
          </label>
          <select
            id="filter-sync"
            value={params.get('synced') ?? ''}
            onChange={(e) => setFilter('synced', e.target.value)}
            className={selectClass}
          >
            <option value="">Any sheet status</option>
            <option value="true">In the sheet</option>
            <option value="false">Not in the sheet yet</option>
          </select>
        </div>
        <div className="flex flex-wrap items-end gap-3 sm:col-span-2 lg:col-span-5">
          <div>
            <label htmlFor="filter-from" className="text-sm text-stone-600">
              Received from
            </label>
            <input
              id="filter-from"
              type="date"
              value={params.get('from') ?? ''}
              max={params.get('to') || undefined}
              onChange={(e) => setFilter('from', e.target.value)}
              className={`${selectClass} mt-1 py-2`}
            />
          </div>
          <div>
            <label htmlFor="filter-to" className="text-sm text-stone-600">
              to
            </label>
            <input
              id="filter-to"
              type="date"
              value={params.get('to') ?? ''}
              min={params.get('from') || undefined}
              onChange={(e) => setFilter('to', e.target.value)}
              className={`${selectClass} mt-1 py-2`}
            />
          </div>
          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setSearchText('')
                setParams(new URLSearchParams(), { replace: true })
              }}
              className={secondaryButtonClass}
            >
              Clear filters
            </button>
          )}
          <a
            href={`/api/enquiries/export.csv${exportQuery ? `?${exportQuery}` : ''}`}
            download
            className={`${secondaryButtonClass} ml-auto`}
          >
            Download CSV
          </a>
        </div>
      </form>

      {error && (
        <div className="mb-5">
          <ErrorNotice message={error} onRetry={reload} />
        </div>
      )}

      {!data ? (
        !error && <LoadingBlock label="Loading enquiries…" />
      ) : data.data.length === 0 ? (
        <EmptyState title={hasFilters ? 'No enquiries match these filters' : 'No enquiries yet'}>
          {hasFilters
            ? 'Try a different search or clear a filter.'
            : 'Enquiries sent from the website’s contact form will appear here.'}
        </EmptyState>
      ) : (
        <div aria-busy={loading} className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
          {/* Wide screens: table */}
          <div className="hidden overflow-x-auto rounded-lg border border-stone-200 bg-white md:block">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Customer enquiries</caption>
              <thead className="border-b border-stone-200 bg-stone-50 text-stone-600">
                <tr>
                  {['Received', 'Customer', 'About', 'Status', 'Sheet', ''].map((heading, i) => (
                    <th key={i} scope="col" className="px-4 py-3 font-medium">
                      {heading || <span className="sr-only">Actions</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {data.data.map((enquiry) => (
                  <tr key={enquiry.id} className="align-top hover:bg-stone-50">
                    <td className="px-4 py-3 whitespace-nowrap text-stone-600">
                      {formatDate(enquiry.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-stone-900">{enquiry.name}</p>
                      <p className="break-all text-stone-500">{enquiry.email}</p>
                      <p className="text-stone-500">{enquiry.phone}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p>{enquiry.inquiryType}</p>
                      {enquiry.productName && <p className="text-stone-500">{enquiry.productName}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={enquiry.status} />
                    </td>
                    <td className="px-4 py-3">
                      {enquiry.sheetSyncedAt ? <Pill tone="ok">Synced</Pill> : <Pill tone="warn">Waiting</Pill>}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => setSelected(enquiry)}
                        aria-haspopup="dialog"
                        className="font-medium text-maroon hover:underline"
                      >
                        View<span className="sr-only"> enquiry from {enquiry.name}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Narrow screens: cards */}
          <ul className="space-y-3 md:hidden">
            {data.data.map((enquiry) => (
              <li key={enquiry.id}>
                <button
                  type="button"
                  onClick={() => setSelected(enquiry)}
                  aria-haspopup="dialog"
                  className="block w-full rounded-lg border border-stone-200 bg-white p-4 text-left"
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="font-medium text-stone-900">{enquiry.name}</span>
                    <StatusBadge status={enquiry.status} />
                  </span>
                  <span className="mt-1 block text-sm text-stone-600">
                    {enquiry.productName ?? enquiry.inquiryType}
                  </span>
                  <span className="mt-2 flex items-center justify-between gap-3 text-sm text-stone-500">
                    {formatDate(enquiry.createdAt)}
                    {!enquiry.sheetSyncedAt && <Pill tone="warn">Not in sheet</Pill>}
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <nav aria-label="Pages" className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-stone-600">
              {total} {total === 1 ? 'enquiry' : 'enquiries'} · page {page} of {pageCount}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => goToPage(page - 1)}
                disabled={page <= 1}
                className={secondaryButtonClass}
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => goToPage(page + 1)}
                disabled={page >= pageCount}
                className={secondaryButtonClass}
              >
                Next
              </button>
            </div>
          </nav>
        </div>
      )}

      {selected && (
        <EnquiryDetail
          key={selected.id}
          enquiry={selected}
          onClose={() => setSelected(null)}
          onUpdated={onUpdated}
        />
      )}
    </>
  )
}
