import { MessageCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { formatBDT } from '@/lib/utils'
import { buildPaymentThanksMessage, openWhatsAppMessage } from '@/lib/whatsappMessages'

interface PaymentThanksPromptProps {
  firstName: string
  phone: string | null
  amount: number
  onClose: () => void
}

/**
 * Transient one-tap prompt shown right after a payment is recorded, offering
 * to send a cordial WhatsApp thank-you. Nothing is persisted — this is a
 * prompt, not a tracked feature; Skip/close just dismisses it.
 */
export function PaymentThanksPrompt({ firstName, phone, amount, onClose }: PaymentThanksPromptProps) {
  function handleSend() {
    const message = buildPaymentThanksMessage(firstName, amount)
    openWhatsAppMessage(phone, message)
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-sm w-full p-6">
        <h2 className="font-display text-lg font-bold">Payment recorded</h2>
        <p className="text-sm text-text-secondary mt-2">
          Payment of {formatBDT(amount)} recorded. Send a WhatsApp thank-you to {firstName}?
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
