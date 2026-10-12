import type { EnquiryData } from '../lib/validation'

/** Set VITE_API_URL only when the API lives on a different origin from the site. */
const API_BASE = import.meta.env.VITE_API_URL ?? ''

/**
 * Sends a contact-form enquiry to the backend.
 * Throws on any failure — the form shows a generic error message.
 */
export async function submitEnquiry(data: EnquiryData, productId?: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/enquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: data.fullName,
      email: data.email,
      phone: data.phone,
      inquiryType: data.inquiryType,
      message: data.message,
      productId,
    }),
  })

  if (!response.ok) throw new Error(`Enquiry failed with status ${response.status}`)
}
