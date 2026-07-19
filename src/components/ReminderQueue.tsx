import { useEffect, useState } from 'react'
import { Bell, ChevronDown, ChevronUp, MessageCircle } from 'lucide-react'
import { format, isSameDay } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { logActivity } from '@/lib/activityLog'
import { buildAppointmentReminderMessage, openWhatsAppMessage } from '@/lib/whatsappMessages'

interface DueAppointment {
  id: string
  patient_id: string
  date_time: string
  type: string
  status: string
  patients: {
    first_name: string
    last_name: string
    phone: string | null
  } | null
}

const REMINDER_WINDOW_MS = 6 * 60 * 60 * 1000
const REFRESH_INTERVAL_MS = 60 * 1000

/**
 * Due-reminder queue: appointments today, within the next 6 hours, that
 * haven't had a WhatsApp reminder sent yet. One tap opens WhatsApp with a
 * prefilled message and marks the appointment reminded. Renders nothing when
 * the queue is empty (including on error — this must never break the page).
 */
export function ReminderQueue({ refreshToken }: { refreshToken?: number }) {
  const [dueAppointments, setDueAppointments] = useState<DueAppointment[]>([])
  const [sentIds, setSentIds] = useState<Set<string>>(new Set())
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    load()
    const interval = setInterval(load, REFRESH_INTERVAL_MS)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken])

  async function load() {
    try {
      const now = new Date()
      const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_MS)
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          id, patient_id, date_time, type, status,
          patients (first_name, last_name, phone)
        `)
        .gte('date_time', now.toISOString())
        .lte('date_time', windowEnd.toISOString())
        .in('status', ['Scheduled', 'Confirmed'])
        .is('reminder_sent_at', null)
        .order('date_time')

      if (error) throw error

      const dueToday = ((data as any) || []).filter((appt: DueAppointment) =>
        isSameDay(new Date(appt.date_time), now)
      )
      setDueAppointments(dueToday)
      setSentIds(new Set())
    } catch (err) {
      console.error('Error loading reminder queue:', err)
      setDueAppointments([])
    }
  }

  function handleSend(appt: DueAppointment) {
    if (!appt.patients) return
    const timeStr = format(new Date(appt.date_time), 'h:mm a')
    const message = buildAppointmentReminderMessage(appt.patients.first_name, timeStr, appt.type)
    openWhatsAppMessage(appt.patients.phone, message)
    markSent(appt)
  }

  async function markSent(appt: DueAppointment) {
    setSentIds(prev => new Set(prev).add(appt.id))
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq('id', appt.id)
      if (error) throw error

      logActivity({
        action: 'edit',
        entityType: 'appointment',
        entityId: appt.id,
        entityLabel: appt.type,
        patientId: appt.patient_id,
        patientName: appt.patients ? `${appt.patients.first_name} ${appt.patients.last_name}` : null,
        details: 'WhatsApp reminder sent',
      })
    } catch (err) {
      console.error('Error marking reminder sent:', err)
    }
  }

  async function handleUndo(appt: DueAppointment) {
    setSentIds(prev => {
      const next = new Set(prev)
      next.delete(appt.id)
      return next
    })
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ reminder_sent_at: null })
        .eq('id', appt.id)
      if (error) throw error
    } catch (err) {
      console.error('Error undoing reminder:', err)
    }
  }

  if (dueAppointments.length === 0) return null

  const pendingCount = dueAppointments.filter(a => !sentIds.has(a.id)).length

  return (
    <div className="bg-card rounded-lg shadow-sm border border-amber-200 overflow-hidden">
      <button
        onClick={() => setCollapsed(prev => !prev)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-amber-50 text-amber-800"
      >
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4" />
          <span className="font-medium text-sm">Reminders due today</span>
          {pendingCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold bg-amber-200 text-amber-900">
              {pendingCount}
            </span>
          )}
        </div>
        {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
      </button>

      {!collapsed && (
        <div className="divide-y divide-gray-200">
          {dueAppointments.map(appt => {
            const sent = sentIds.has(appt.id)
            const phoneUsable = !!appt.patients?.phone
            return (
              <div key={appt.id} className={`p-3 flex items-center justify-between gap-3 ${sent ? 'opacity-50' : ''}`}>
                <div className="min-w-0">
                  <p className="font-medium truncate">
                    {appt.patients ? `${appt.patients.first_name} ${appt.patients.last_name}` : 'Unknown patient'}
                  </p>
                  <p className="text-sm text-text-secondary">
                    {format(new Date(appt.date_time), 'h:mm a')} • {appt.type}
                  </p>
                </div>

                {sent ? (
                  <button
                    onClick={() => handleUndo(appt)}
                    className="shrink-0 text-xs font-medium text-gray-500 hover:text-gray-700 underline"
                  >
                    Sent — Undo
                  </button>
                ) : phoneUsable ? (
                  <button
                    onClick={() => handleSend(appt)}
                    className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    Send
                  </button>
                ) : (
                  <button disabled className="shrink-0 px-2.5 py-1.5 text-xs font-medium text-gray-400 bg-gray-100 rounded-lg cursor-not-allowed">
                    No phone
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
