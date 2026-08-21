import { useState, useEffect } from 'react'
import { X, Send, Copy, Check, MessageSquare, Phone, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { openWhatsAppMessage, buildBirthdayGreetingMessage, buildAnniversaryGreetingMessage, CLINIC_NAME } from '@/lib/whatsappMessages'
import { markCelebrationSent, type CelebrationEvent } from '@/lib/celebrationReminders'
import { logActivity } from '@/lib/activityLog'

interface CelebrationGreetingModalProps {
  event: CelebrationEvent | null
  onClose: () => void
  onSent?: (event: CelebrationEvent) => void
}

export function CelebrationGreetingModal({ event, onClose, onSent }: CelebrationGreetingModalProps) {
  const [lang, setLang] = useState<'bn' | 'en'>('bn')
  const [customText, setCustomText] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!event) return
    const defaultText =
      event.type === 'birthday'
        ? buildBirthdayGreetingMessage(event.patientName, CLINIC_NAME, lang)
        : buildAnniversaryGreetingMessage(event.patientName, CLINIC_NAME, lang)
    setCustomText(defaultText)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event?.id, lang])

  if (!event) return null

  const isBirthday = event.type === 'birthday'
  const title = isBirthday ? 'Birthday Greeting' : 'Anniversary Greeting'
  const emoji = isBirthday ? '🎂' : '💐'

  function handleSend() {
    if (!event) return
    const success = openWhatsAppMessage(event.phone, customText)
    if (success) {
      markCelebrationSent(event.patientId, event.type)
      logActivity({
        action: 'create',
        entityType: 'whatsapp_greeting',
        entityId: event.patientId,
        entityLabel: event.patientName,
        patientId: event.patientId,
        patientName: event.patientName,
        details: `${event.type} greeting via WhatsApp (${lang})`,
      })
      if (onSent) onSent(event)
      onClose()
    } else {
      alert('Could not open WhatsApp: Invalid or missing phone number.')
    }
  }

  function handleCopy() {
    navigator.clipboard.writeText(customText)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-elevation-lg max-w-lg w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-br from-primary to-primary-bright p-5 text-white relative">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-white/20 text-2xl flex items-center justify-center border border-white/30">
                {emoji}
              </div>
              <div>
                <h3 className="font-semibold text-lg text-white flex items-center gap-2">
                  <span>{title}</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-white/20 text-white border border-white/30">
                    {event.isToday ? 'Today' : `In ${event.daysUntil} day${event.daysUntil > 1 ? 's' : ''}`}
                  </span>
                </h3>
                <p className="text-xs text-white/85 mt-0.5">
                  To: <strong className="text-white">{event.patientName}</strong> {event.phone && <span className="font-mono text-[11px] opacity-90">({event.phone})</span>}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white/80 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Language Selector */}
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
              Greeting Language
            </label>
            <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-lg border border-gray-200">
              <button
                type="button"
                onClick={() => setLang('bn')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  lang === 'bn'
                    ? 'bg-white text-primary-deep shadow-sm border border-primary/20'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                বাংলা (Bengali)
              </button>
              <button
                type="button"
                onClick={() => setLang('en')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                  lang === 'en'
                    ? 'bg-white text-primary-deep shadow-sm border border-primary/20'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                English
              </button>
            </div>
          </div>

          {/* Message Text Area */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-text-secondary flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-primary" />
                Message Text (Editable)
              </label>
              <button
                type="button"
                onClick={handleCopy}
                className="text-[11px] font-semibold text-primary-deep hover:text-primary flex items-center gap-1"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <textarea
              rows={4}
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              className="w-full p-3 text-sm rounded-lg border border-gray-300 bg-gray-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all leading-relaxed"
            />
          </div>

          {/* Quick Info */}
          <div className="flex items-center justify-between text-xs p-3 rounded-lg bg-primary/5 border border-primary/15">
            <div className="flex items-center gap-2 text-primary-deep font-medium">
              <Phone className="w-4 h-4 text-primary" />
              <span>Target: {event.phone || 'No phone recorded'}</span>
            </div>
            <div className="flex items-center gap-1 text-primary-deep font-semibold">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>via WhatsApp</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 bg-gray-50 border-t border-gray-200 flex items-center justify-end gap-3">
          <Button variant="outline" onClick={onClose} className="text-xs">
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleSend}
            disabled={!event.phone}
            className="text-xs flex items-center gap-2"
          >
            <Send className="w-4 h-4" />
            Launch WhatsApp
          </Button>
        </div>
      </div>
    </div>
  )
}
