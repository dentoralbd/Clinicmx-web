import type { jsPDF } from 'jspdf'

export function toWhatsAppNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('880')) return digits
  if (digits.startsWith('0')) return `880${digits.slice(1)}`
  if (digits.length === 10) return `880${digits}`
  return digits
}

export interface SharePdfInfo {
  channel: 'email' | 'whatsapp'
  email?: string | null
  waNumber?: string | null
  subject: string
  text: string
}

/**
 * Shares a jsPDF document as a real file via the OS share sheet when the
 * browser supports it (Web Share API with files — most mobile browsers).
 * Falls back to downloading the PDF and opening the mail/WhatsApp compose
 * window, since a web link can never force-attach a file to those apps.
 */
export async function sharePdf(doc: jsPDF, fileName: string, info: SharePdfInfo): Promise<void> {
  const blob = doc.output('blob')
  const file = new File([blob], fileName, { type: 'application/pdf' })

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: info.subject, text: info.text })
      return
    } catch (error) {
      if ((error as { name?: string })?.name === 'AbortError') return
      console.error('Native share failed, falling back to download:', error)
    }
  }

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  URL.revokeObjectURL(url)

  if (info.channel === 'email') {
    alert('Invoice PDF downloaded. Please attach it to the email before sending.')
    window.location.href = `mailto:${info.email}?subject=${encodeURIComponent(info.subject)}&body=${encodeURIComponent(info.text)}`
  } else {
    alert('Invoice PDF downloaded. Please attach it in WhatsApp before sending.')
    window.open(`https://wa.me/${info.waNumber}?text=${encodeURIComponent(info.text)}`, '_blank')
  }
}
