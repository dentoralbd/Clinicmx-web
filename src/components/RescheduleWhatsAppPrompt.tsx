import { MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { buildRescheduleMessage, openWhatsAppMessage } from '@/lib/whatsappMessages'

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
  function handleSend() {
    const message = buildRescheduleMessage(firstName, dateStr, timeStr)
    openWhatsAppMessage(phone, message)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
        <h2 className="font-display text-lg font-bold">Appointment rescheduled</h2>
        <p className="text-sm text-text-secondary mt-2">
          Moved to {dateStr} at {timeStr}. Send a WhatsApp update to {firstName}?
        </p>
        <div className="flex gap-3 pt-5">
          <Button className="flex-1" onClick={handleSend}>
            <MessageCircle className="w-4 h-4 mr-2" />
            Send on WhatsApp
          </Button>
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Skip
          </Button>
        </div>
      </div>
    </div>
  )
}
