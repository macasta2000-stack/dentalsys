// ============================================================
// Shared utility functions
// ============================================================

/**
 * Format a phone number for display.
 * Supports 10-digit and 11-digit Argentine numbers.
 * Returns '—' for empty/null values.
 */
export function formatPhone(phone) {
  if (!phone) return '—'
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 7)}-${digits.slice(7)}`
  if (digits.length === 11) return `(${digits.slice(0, 4)}) ${digits.slice(4, 8)}-${digits.slice(8)}`
  return phone // return as-is if format unknown
}
