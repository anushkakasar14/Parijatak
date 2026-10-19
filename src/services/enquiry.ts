import type { EnquiryData, EnquiryErrors } from '../lib/validation'
import { ApiError, api } from './api'

/** A failed submission: a message to show, and any fields the server rejected. */
export class EnquiryError extends Error {
  readonly fieldErrors: EnquiryErrors

  constructor(message: string, fieldErrors: EnquiryErrors = {}) {
    super(message)
    this.fieldErrors = fieldErrors
  }
}

/** The server names two fields differently from the form. */
const fieldNames: Record<string, keyof EnquiryData> = {
  name: 'fullName',
  email: 'email',
  phone: 'phone',
  inquiryType: 'inquiryType',
  message: 'message',
}

/**
 * Sends an enquiry to the backend. Resolves only once the server has confirmed that it
 * was saved; otherwise throws EnquiryError and the form keeps what the visitor typed.
 */
export async function submitEnquiry(data: EnquiryData, productId?: string, trap = ''): Promise<void> {
  try {
    await api('/enquiries', {
      method: 'POST',
      body: {
        name: data.fullName,
        email: data.email,
        phone: data.phone,
        inquiryType: data.inquiryType,
        message: data.message,
        productId,
        ...(trap ? { contactPreference: trap } : {}),
      },
    })
  } catch (err) {
    if (!(err instanceof ApiError)) throw new EnquiryError('Your enquiry was not sent. Please try again.')

    const fieldErrors: EnquiryErrors = {}
    for (const [serverName, message] of Object.entries(err.errors ?? {})) {
      const field = fieldNames[serverName]
      if (field) fieldErrors[field] = message
    }

    // The server's wording is safe to show for validation and rate-limit answers;
    // anything else gets a plain explanation.
    const message =
      err.status === 400 || err.status === 429
        ? err.message
        : 'Sorry, something went wrong and your enquiry was not sent. Please try again, or message us on WhatsApp.'
    throw new EnquiryError(message, fieldErrors)
  }
}
