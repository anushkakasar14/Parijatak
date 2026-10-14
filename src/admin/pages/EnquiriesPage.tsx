import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ApiError, adminFetch } from '../api'
import { useAuth } from '../AuthContext'
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
import { enquiryStatuses, inquiryTypes } from '../types'
import type { Enquiry, EnquiryStatus, Paginated } from '../types'
import { fieldClass, labelClass, primaryButtonClass, secondaryButtonClass } from '../ui'

const PAGE_SIZE = 20

/** Filters live in the URL, so they survive a refresh and can be linked to. */
const FILTER_KEYS = ['search', 'status', 'inquiryType', 'hasProduct', 'synced'] as const

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
  const [saving, setSaving] = useState(false)
  const [result, setResult] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)

  const save = async () => {
    setSaving(true)
    setResult(null)
    try {
      const updated = await adminFetch<Enquiry>(`/enquiries/${enquiry.id}`, {
        method: 'PATCH',
        body: { status },
      })
      onUpdated(updated)
      setResult({ kind: 'ok', text: 'Status saved.' })
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
          <dd className="break-all">
            <a href={`mailto:${enquiry.email}`} className={linkClass}>
              {enquiry.email}
            </a>
          </dd>
        </div>
        <div>
          <dt className="text-sm text-stone-500">Contact number</dt>
          <dd className="flex flex-wrap gap-x-4">
            <a href={`tel:${enquiry.phone}`} className={linkClass}>
              {enquiry.phone}
            </a>
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
          <dt className="text-sm text-stone-500">Message</dt>
          <dd className="mt-1 rounded-md bg-stone-50 p-3 break-words whitespace-pre-wrap">
            {enquiry.message}
          </dd>
        </div>
        <div className="sm:col-span-2">
          <dt className="text-sm text-stone-500">Google Sheets</dt>
          <dd>
            {enquiry.sheetSyncedAt
              ? `Copied to the sheet on ${formatDate(enquiry.sheetSyncedAt)}`
              : 'Not in the sheet yet'}
          </dd>
        </div>
      </dl>

      <div className="mt-6 border-t border-stone-200 pt-5">
        {result && (
          <div className="mb-4">
            <Notice kind={result.kind}>{result.text}</Notice>
          </div>
        )}
        {canEdit ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-44 flex-1">
              <label htmlFor="enquiry-status" className={labelClass}>
                Status
              </label>
              <select
                id="enquiry-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as EnquiryStatus)}
                className={`${fieldClass} capitalize`}
              >
                {enquiryStatuses.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              onClick={save}
              disabled={saving || status === enquiry.status}
              className={primaryButtonClass}
            >
              {saving ? 'Saving…' : 'Save status'}
            </button>
          </div>
        ) : (
          <p className="flex items-center gap-3 text-stone-600">
            Status <StatusBadge status={enquiry.status} />
            <span className="text-sm">Your account can view enquiries but not change them.</span>
          </p>
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
    const next = new URLSearchParams(params)
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
  const total = data?.pagination.total ?? 0
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const goToPage = (target: number) => {
    const next = new URLSearchParams(params)
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
            className={`${selectClass} capitalize`}
          >
            <option value="">All statuses</option>
            {enquiryStatuses.map((s) => (
              <option key={s} value={s}>
                {s}
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
