import { formatBDT } from '@/lib/utils'
import { toWhatsAppNumber } from '@/lib/sharePdf'

/** Displayed in reminder/thank-you message text. Edit to match the clinic. */
export const CLINIC_NAME = 'DentOral Dental Care'

export function buildAppointmentReminderMessage(firstName: string, timeStr: string, type: string): string {
  return `Hello ${firstName}, this is a friendly reminder from ${CLINIC_NAME}: you have a ${type} appointment today at ${timeStr}. Please call us if you need to reschedule. Thank you!`
}

export function buildPaymentThanksMessage(firstName: string, amount: number, totalPaid: number): string {
  // Only mention the running total when earlier installments exist —
  // repeating the same figure twice on a first payment reads oddly.
  const totalLine = totalPaid > amount ? ` Total paid so far: ${formatBDT(totalPaid)}.` : ''
  return `Dear ${firstName}, we have received your payment of ${formatBDT(amount)}.${totalLine} Thank you for choosing ${CLINIC_NAME}. We wish you good health!`
}

export function buildRescheduleMessage(firstName: string, dateStr: string, timeStr: string): string {
  return `Hello ${firstName}, your appointment with ${CLINIC_NAME} has been rescheduled to ${dateStr} at ${timeStr}. Please call us if you have any questions. Thank you!`
}

export function buildTreatmentFollowUpMessage(firstName: string): string {
  return `Hello ${firstName}, we hope you are keeping well. Our records show your dental treatment at ${CLINIC_NAME} is not yet complete. Whenever it suits you, please call us to book your next visit so we can finish your treatment. Take care!`
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

export function buildBirthdayGreetingMessage(
  firstName: string,
  clinicName: string = CLINIC_NAME,
  lang: 'en' | 'bn' = 'bn'
): string {
  if (lang === 'bn') {
    return `প্রিয় ${firstName}, ${clinicName}-এর পক্ষ থেকে আপনাকে জন্মদিনের আন্তরিক শুভেচ্ছা ও অভিনন্দন! 🎂 আপনার জীবন সুস্বাস্থ্য, সুখ ও সুন্দর হাসিতে ভরে উঠুক। ✨`
  }
  return `Dear ${firstName}, the entire team at ${clinicName} wishes you a very Happy Birthday! 🎂 May your special day be filled with joy, happiness, and good health! ✨`
}

export function buildAnniversaryGreetingMessage(
  firstName: string,
  clinicName: string = CLINIC_NAME,
  lang: 'en' | 'bn' = 'bn'
): string {
  if (lang === 'bn') {
    return `প্রিয় ${firstName}, ${clinicName}-এর পক্ষ থেকে আপনাকে বিবাহবার্ষিকীর আন্তরিক শুভেচ্ছা ও অভিনন্দন! 💐 আপনার আগামী দিনগুলো ভালোবাসা, সুস্বাস্থ্য ও আনন্দে ভরে উঠুক। ✨`
  }
  return `Dear ${firstName}, wishing you a very Happy Anniversary! 💐 May your special day be blessed with love, joy, and good health. Warm wishes from ${clinicName}! ✨`
}
