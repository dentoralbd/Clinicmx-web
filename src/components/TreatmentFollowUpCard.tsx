import { useEffect, useState } from 'react'
import { HeartHandshake, ChevronDown, ChevronUp, MessageCircle } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { logActivity } from '@/lib/activityLog'
import { buildTreatmentFollowUpMessage, openWhatsAppMessage } from '@/lib/whatsappMessages'

interface DormantPatient {
  id: string
  first_name: string
  last_name: string
  phone: string | null
  lastVisitAt: string | null
  incompleteCount: number
}

const DORMANT_MONTHS = 2
const SNOOZE_DAYS = 30

/**
 * Dashboard card: patients with an incomplete treatment plan who haven't
 * visited in 2+ months and have no upcoming appointment booked. One tap
 * opens WhatsApp with a soft, cordial reminder and snoozes the patient for
 * 30 days. Renders nothing when the list is empty (including on error —
 * this must never break the Dashboard).
 */
export function TreatmentFollowUpCard() {
  const [patients, setPatients] = useState<DormantPatient[]>([])
  const [sentIds, setSentIds] = useState<Set<string>>(new Set())
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function load() {
    try {
      const now = new Date()
      const dormantCutoff = new Date(now)
      dormantCutoff.setMonth(dormantCutoff.getMonth() - DORMANT_MONTHS)
      const snoozeCutoff = new Date(now.getTime() - SNOOZE_DAYS * 24 * 60 * 60 * 1000)

      const { data: incompleteTreatments, error: treatmentsError } = await supabase
        .from('treatments')
        .select('patient_id, created_at')
        .in('status', ['Planned', 'In Progress'])
      if (treatmentsError) throw treatmentsError

      const patientIds = Array.from(new Set((incompleteTreatments || []).map(t => t.patient_id)))
      if (patientIds.length === 0) {
        setPatients([])
        return
      }

      const oldestIncompleteByPatient = new Map<string, string>()
      for (const t of incompleteTreatments || []) {
        const existing = oldestIncompleteByPatient.get(t.patient_id)
        if (!existing || t.created_at < existing) oldestIncompleteByPatient.set(t.patient_id, t.created_at)
      }
      const incompleteCountByPatient = new Map<string, number>()
      for (const t of incompleteTreatments || []) {
        incompleteCountByPatient.set(t.patient_id, (incompleteCountByPatient.get(t.patient_id) || 0) + 1)
      }

      const [{ data: patientRows, error: patientsError }, { data: visitRows, error: visitsError }, { data: upcomingAppts, error: apptsError }] =
        await Promise.all([
          supabase
            .from('patients')
            .select('id, first_name, last_name, phone, followup_reminder_sent_at')
            .in('id', patientIds),
          supabase
            .from('patient_visits')
            .select('patient_id, visit_date')
            .in('patient_id', patientIds),
          supabase
            .from('appointments')
            .select('patient_id')
            .in('patient_id', patientIds)
            .gte('date_time', now.toISOString())
            .in('status', ['Scheduled', 'Confirmed']),
        ])
      if (patientsError) throw patientsError
      if (visitsError) throw visitsError
      if (apptsError) throw apptsError

      const lastVisitByPatient = new Map<string, string>()
      for (const v of visitRows || []) {
        const existing = lastVisitByPatient.get(v.patient_id)
        if (!existing || v.visit_date > existing) lastVisitByPatient.set(v.patient_id, v.visit_date)
      }
      const patientsWithUpcoming = new Set((upcomingAppts || []).map(a => a.patient_id))

      const dormant: DormantPatient[] = []
      for (const p of patientRows || []) {
        if (patientsWithUpcoming.has(p.id)) continue

        const lastVisitAt = lastVisitByPatient.get(p.id) ?? null
        const referenceDate = lastVisitAt ? new Date(lastVisitAt) : new Date(oldestIncompleteByPatient.get(p.id)!)
        if (referenceDate > dormantCutoff) continue

        const remindedAt = p.followup_reminder_sent_at
        if (remindedAt && new Date(remindedAt) > snoozeCutoff) continue

        dormant.push({
          id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
          phone: p.phone,
          lastVisitAt,
          incompleteCount: incompleteCountByPatient.get(p.id) || 0,
        })
      }

      dormant.sort((a, b) => {
        const aTime = a.lastVisitAt ? new Date(a.lastVisitAt).getTime() : 0
        const bTime = b.lastVisitAt ? new Date(b.lastVisitAt).getTime() : 0
        return aTime - bTime
      })

      setPatients(dormant)
      setSentIds(new Set())
    } catch (err) {
      console.error('Error loading treatment follow-up list:', err)
      setPatients([])
    }
  }

  function handleSend(patient: DormantPatient) {
    const message = buildTreatmentFollowUpMessage(patient.first_name)
    openWhatsAppMessage(patient.phone, message)
    markSent(patient)
  }

  async function markSent(patient: DormantPatient) {
    setSentIds(prev => new Set(prev).add(patient.id))
    try {
      const { error } = await supabase
        .from('patients')
        .update({ followup_reminder_sent_at: new Date().toISOString() })
        .eq('id', patient.id)
      if (error) throw error

      logActivity({
        action: 'edit',
        entityType: 'patient',
        entityId: patient.id,
        patientId: patient.id,
        patientName: `${patient.first_name} ${patient.last_name}`,
        details: 'Treatment follow-up reminder sent',
      })
    } catch (err) {
      console.error('Error marking follow-up reminder sent:', err)
    }
  }

  async function handleUndo(patient: DormantPatient) {
    setSentIds(prev => {
      const next = new Set(prev)
      next.delete(patient.id)
      return next
    })
    try {
      const { error } = await supabase
        .from('patients')
        .update({ followup_reminder_sent_at: null })
        .eq('id', patient.id)
      if (error) throw error
    } catch (err) {
      console.error('Error undoing follow-up reminder:', err)
    }
  }

  if (patients.length === 0) return null

  const pendingCount = patients.filter(p => !sentIds.has(p.id)).length

  return (
    <div className="bg-card rounded-lg shadow-sm border border-blue-200 overflow-hidden">
      <button
        onClick={() => setCollapsed(prev => !prev)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-blue-50 text-blue-800"
      >
        <div className="flex items-center gap-2">
          <HeartHandshake className="w-4 h-4" />
          <span className="font-medium text-sm">Treatment follow-up reminders</span>
          {pendingCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold bg-blue-200 text-blue-900">
              {pendingCount}
            </span>
          )}
        </div>
        {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
      </button>

      {!collapsed && (
        <div className="divide-y divide-gray-200">
          {patients.map(patient => {
            const sent = sentIds.has(patient.id)
            const phoneUsable = !!patient.phone
            return (
              <div key={patient.id} className={`p-3 flex items-center justify-between gap-3 ${sent ? 'opacity-50' : ''}`}>
                <div className="min-w-0">
                  <p className="font-medium truncate">
                    {patient.first_name} {patient.last_name}
                  </p>
                  <p className="text-sm text-text-secondary">
                    {patient.lastVisitAt
                      ? `Last visit: ${formatDistanceToNow(new Date(patient.lastVisitAt), { addSuffix: true })}`
                      : 'No visits recorded'}
                    {' • '}
                    {patient.incompleteCount} incomplete treatment{patient.incompleteCount === 1 ? '' : 's'}
                  </p>
                </div>

                {sent ? (
                  <button
                    onClick={() => handleUndo(patient)}
                    className="shrink-0 text-xs font-medium text-gray-500 hover:text-gray-700 underline"
                  >
                    Sent — Undo
                  </button>
                ) : phoneUsable ? (
                  <button
                    onClick={() => handleSend(patient)}
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
