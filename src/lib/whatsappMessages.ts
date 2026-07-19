import { formatBDT } from '@/lib/utils'
import { toWhatsAppNumber } from '@/lib/sharePdf'

/** Displayed in reminder/thank-you message text. Edit to match the clinic. */
export const CLINIC_NAME = 'DentOral Dental Care'

export function buildAppointmentReminderMessage(firstName: string, timeStr: string, type: string): string {
  return `Hello ${firstName}, this is a friendly reminder from ${CLINIC_NAME}: you have a ${type} appointment today at ${timeStr}. Please call us if you need to reschedule. Thank you!`
}

export function buildPaymentThanksMessage(firstName: string, amount: number): string {
  return `Dear ${firstName}, we have received your payment of ${formatBDT(amount)}. Thank you for choosing ${CLINIC_NAME}. We wish you good health!`
}

export function buildRescheduleMessage(firstName: string, dateStr: string, timeStr: string): string {
  return `Hello ${firstName}, your appointment with ${CLINIC_NAME} has been rescheduled to ${dateStr} at ${timeStr}. Please call us if you have any questions. Thank you!`
}

/**
 * Opens WhatsApp with a prefilled message to the given (stored-format) phone
 * number. Must be called synchronously inside a click handler — browsers
 * block window.open() calls that happen after an await. Returns false when
 * the phone number has nothing usable to dial (caller should disable the
 * triggering button in that case rather than call this).
 */
export function openWhatsAppMessage(phone: string | null | undefined, text: string): boolean {
  const waNumber = phone ? toWhatsAppNumber(phone) : null
  if (!waNumber) return false
  window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`, '_blank')
  return true
}
