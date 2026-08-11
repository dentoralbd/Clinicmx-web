import type { jsPDF } from 'jspdf'
import { IS_TAURI, openExternal } from './runtimeEnv'
import { downloadBlob } from './downloadBlob'

export function toWhatsAppNumber(phone: string): string | null {
  const digits = phone.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('880')) return digits
  if (digits.startsWith('0')) return `880${digits.slice(1)}`
  if (digits.length === 10) return `880${digits}`
  return digits
}

export interface SharePdfInfo {
  /** Omit for a plain "save/share this file" action with no specific
   * recipient — e.g. a report download button, as opposed to "send this
   * prescription to the patient via WhatsApp". */
  channel?: 'email' | 'whatsapp'
  email?: string | null
  waNumber?: string | null
  subject: string
  text: string
  /** Noun used in the fallback download alert, e.g. "Invoice", "Prescription". Defaults to "Invoice". */
  docLabel?: string
}

/**
 * Shares a jsPDF document as a real file via the OS share sheet when the
 * browser supports it (Web Share API with files — most mobile browsers,
 * and critically the Capacitor Android WebView the app runs in as a
 * native APK, where a plain <a download> click silently does nothing).
 * Falls back to downloading the PDF and, if a channel was given, opening
 * the mail/WhatsApp compose window — a web link can never force-attach a
 * file to those apps.
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

  const saved = await downloadBlob(blob, fileName)
  if (!saved) return // Tauri Save dialog was cancelled — nothing to share

  const docLabel = info.docLabel || 'Invoice'
  const verb = IS_TAURI ? 'saved' : 'downloaded'
  if (info.channel === 'email') {
    alert(`${docLabel} PDF ${verb}. Please attach it to the email before sending.`)
    await openExternal(
      `mailto:${info.email}?subject=${encodeURIComponent(info.subject)}&body=${encodeURIComponent(info.text)}`
    )
  } else if (info.channel === 'whatsapp') {
    alert(`${docLabel} PDF ${verb}. Please attach it in WhatsApp before sending.`)
    await openExternal(`https://wa.me/${info.waNumber}?text=${encodeURIComponent(info.text)}`)
  } else {
    alert(`${docLabel} PDF ${verb}.`)
  }
}
