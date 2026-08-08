import { useState } from 'react'
import { MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { buildRescheduleMessage, openWhatsAppMessage } from '@/lib/whatsappMessages'
import { toWhatsAppNumber } from '@/lib/sharePdf'

interface RescheduleWhatsAppPromptProps {
  firstName: string
  phone: string | null
  dateStr: string
  timeStr: string
  onClose: () => void
}

/**
 * Transient one-tap prompt shown right after an appointment is rescheduled,
 * offering to notify the patient on WhatsApp. Nothing is persisted — Skip
 * or close just dismisses it.
 */
export function RescheduleWhatsAppPrompt({ firstName, phone, dateStr, timeStr, onClose }: RescheduleWhatsAppPromptProps) {
  const [sendError, setSendError] = useState<string | null>(null)
  // toWhatsAppNumber returns null when there are no usable digits to dial —
  // disable up front rather than let a tap silently do nothing.
  const waNumber = phone ? toWhatsAppNumber(phone) : null

  function handleSend() {
    // openWhatsAppMessage must stay synchronous inside this click handler —
    // browsers block window.open() calls that happen after an await.
    const message = buildRescheduleMessage(firstName, dateStr, timeStr)
    if (!openWhatsAppMessage(phone, message)) {
      // Previously this return value was ignored and onClose() ran
      // regardless, so an undialable number looked exactly like success.
      setSendError('Could not open WhatsApp for this number. The appointment was still rescheduled.')
      return
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
        <h2 className="font-display text-lg font-bold">Appointment rescheduled</h2>
        <p className="text-sm text-text-secondary mt-2">
          Moved to {dateStr} at {timeStr}.{' '}
          {waNumber ? `Send a WhatsApp update to ${firstName}?` : `No phone number on file for ${firstName}.`}
        </p>
        <div className="flex gap-3 pt-5">
          <Button className="flex-1" onClick={handleSend} disabled={!waNumber}>
            <MessageCircle className="w-4 h-4 mr-2" />
            {waNumber ? 'Send on WhatsApp' : 'No phone'}
          </Button>
          <Button variant="outline" className="flex-1" onClick={onClose}>
            {waNumber ? 'Skip' : 'Done'}
          </Button>
        </div>
        {sendError && <p className="text-xs text-red-600 pt-3">{sendError}</p>}
      </div>
    </div>
  )
}
