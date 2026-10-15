import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'
import type { EnquiryStatus, PublicationStatus } from './types'
import { primaryButtonClass, secondaryButtonClass } from './ui'

const dateFormat = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
export const formatDate = (iso: string) => dateFormat.format(new Date(iso))

const statusStyles: Record<EnquiryStatus, string> = {
  new: 'bg-sky-100 text-sky-900 ring-sky-200',
  contacted: 'bg-amber-100 text-amber-900 ring-amber-200',
  converted: 'bg-emerald-100 text-emerald-900 ring-emerald-200',
  closed: 'bg-stone-200 text-stone-700 ring-stone-300',
}

const pillClass =
  'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap capitalize ring-1 ring-inset'

export function StatusBadge({ status }: { status: EnquiryStatus }) {
  return <span className={`${pillClass} ${statusStyles[status]}`}>{status}</span>
}

export function Pill({ tone = 'neutral', children }: { tone?: 'neutral' | 'ok' | 'warn'; children: ReactNode }) {
  const tones = {
    neutral: 'bg-stone-100 text-stone-600 ring-stone-200',
    ok: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
    warn: 'bg-amber-50 text-amber-900 ring-amber-200',
  }
  return <span className={`${pillClass} normal-case ${tones[tone]}`}>{children}</span>
}

const publicationLabels: Record<PublicationStatus, { label: string; tone: 'ok' | 'warn' | 'neutral' }> = {
  published: { label: 'Published', tone: 'ok' },
  draft: { label: 'Draft', tone: 'warn' },
  archived: { label: 'Archived', tone: 'neutral' },
}

export function PublicationBadge({ status }: { status: PublicationStatus }) {
  const { label, tone } = publicationLabels[status]
  return <Pill tone={tone}>{label}</Pill>
}

export function PageHeader({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-sans text-2xl font-medium text-stone-900">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-stone-600">{description}</p>}
      </div>
      {action}
    </div>
  )
}

export function LoadingBlock({ label = 'Loading…' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center justify-center gap-3 py-16 text-stone-500">
      <span
        aria-hidden="true"
        className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-maroon"
      />
      {label}
    </div>
  )
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-red-900"
    >
      <p>{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className={secondaryButtonClass}>
          Try again
        </button>
      )}
    </div>
  )
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-stone-300 bg-white px-6 py-14 text-center">
      <p className="font-medium text-stone-900">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-md text-stone-600">{children}</p>}
    </div>
  )
}

/** A notice that reports the result of an action. */
export function Notice({ kind, children }: { kind: 'ok' | 'error'; children: ReactNode }) {
  return (
    <p
      role={kind === 'ok' ? 'status' : 'alert'}
      className={`rounded-md px-3 py-2 text-sm ${
        kind === 'ok' ? 'bg-emerald-50 text-emerald-900' : 'bg-red-50 text-red-800'
      }`}
    >
      {children}
    </p>
  )
}

interface DialogProps {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  /** Tailwind max-width class. */
  width?: string
}

/** Modal built on the native <dialog>: focus is trapped, Escape closes, focus returns afterwards. */
export function Dialog({ open, onClose, title, children, width = 'max-w-lg' }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby="admin-dialog-title"
      // Only this dialog's own events: a dialog opened on top of it (such as the image
      // library over a product form) must not close it too.
      onClose={(e) => e.target === e.currentTarget && onClose()}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className={`m-auto max-h-[90svh] w-[calc(100%-2rem)] ${width} overflow-y-auto rounded-lg bg-white p-0 font-sans text-stone-800 shadow-xl backdrop:bg-stone-900/50`}
    >
      {open && (
        <div className="p-6">
          <div className="mb-4 flex items-start justify-between gap-4">
            <h2 id="admin-dialog-title" className="font-sans text-lg font-medium text-stone-900">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mt-2 -mr-2 grid h-10 w-10 place-items-center rounded-md text-stone-500 hover:bg-stone-100"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
                <path d="M5 5l14 14M19 5L5 19" />
              </svg>
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  )
}

interface ConfirmDialogProps {
  open: boolean
  title: string
  children: ReactNode
  confirmLabel: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({ open, title, children, confirmLabel, busy, onConfirm, onCancel }: ConfirmDialogProps) {
  return (
    <Dialog open={open} onClose={onCancel} title={title} width="max-w-md">
      <div className="text-stone-600">{children}</div>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button type="button" onClick={onCancel} disabled={busy} className={secondaryButtonClass}>
          Cancel
        </button>
        <button type="button" onClick={onConfirm} disabled={busy} className={primaryButtonClass}>
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </Dialog>
  )
}
