// Single source of truth for turning a payments row into a filterable category for the
// Payments Log. payment_method is DB-constrained (payments_payment_method_check,
// migration 009) to exactly 'Cash' | 'Card' | 'Cheque' | 'Transfer' — Bangla QR/bKash/
// Nagad payments are stored as payment_method: 'Transfer' with the real distinguishing
// signal in gateway_provider (migration 066), which no existing UI in the app surfaces.

export type PaymentMethodCategory = 'cash' | 'card' | 'cheque' | 'transfer' | 'bangla_qr' | 'bkash' | 'nagad' | 'other'

export const PAYMENT_METHOD_CATEGORIES: { key: PaymentMethodCategory; label: string }[] = [
  { key: 'cash', label: 'Cash' },
  { key: 'bangla_qr', label: 'Bangla QR' },
  { key: 'bkash', label: 'bKash' },
  { key: 'nagad', label: 'Nagad' },
  { key: 'card', label: 'Card' },
  { key: 'cheque', label: 'Cheque' },
  { key: 'transfer', label: 'Bank Transfer' },
  { key: 'other', label: 'Other' },
]

const CATEGORY_LABEL: Record<PaymentMethodCategory, string> = Object.fromEntries(
  PAYMENT_METHOD_CATEGORIES.map((c) => [c.key, c.label])
) as Record<PaymentMethodCategory, string>

export function getPaymentMethodCategory(p: { payment_method: string | null; gateway_provider: string | null }): PaymentMethodCategory {
  switch (p.gateway_provider) {
    case 'pubali_bank': return 'bangla_qr'
    case 'bkash_sms': return 'bkash'
    case 'nagad_sms': return 'nagad'
    case 'bank_sms':
    case 'generic_sms': return 'other'
  }
  switch (p.payment_method) {
    case 'Cash': return 'cash'
    case 'Card': return 'card'
    case 'Cheque': return 'cheque'
    case 'Transfer': return 'transfer'
    default: return 'other'
  }
}

export function getPaymentMethodLabel(p: { payment_method: string | null; gateway_provider: string | null }): string {
  return CATEGORY_LABEL[getPaymentMethodCategory(p)]
}
