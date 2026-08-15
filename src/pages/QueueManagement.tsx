import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Users,
  UserPlus,
  QrCode,
  Search,
  Play,
  PauseCircle,
  RotateCcw,
  Check,
  Trash2,
  ArrowUp,
  ArrowDown,
  Clock,
  AlertTriangle,
  Banknote,
} from 'lucide-react'
import { qk } from '@/repositories/keys'
import { fetchTodayQueue, fetchQueueSettings } from '@/repositories/queueRepo'
import { fetchDayAppointments } from '@/repositories/appointmentsRepo'
import { fetchPatientsList } from '@/repositories/patientsRepo'
import {
  addQueueEntry,
  callNextPatient,
  holdQueueEntry,
  resumeQueueEntry,
  completeAndBillEntry,
  markBillingSettled,
  markQueueEntryAbsent,
  moveQueueEntry,
  deleteQueueEntry,
  subscribeToQueue,
  pollQueue,
  todayQueueDate,
  HOLD_REASONS,
  type QueueEntry,
} from '@/lib/queueApi'
import { sortQueueEntries, sortKeyForAppointment, sortKeyForWalkIn, computePositions } from '@/lib/queueOrder'
import { calculateQueueEtas, fetchProcedureDurations, getProcedureDuration } from '@/lib/queueEstimation'
import { matchesPatientSearch, createPatient } from '@/lib/patients'
import { canDelete } from '@/lib/appSession'
import { QueueQrScanner } from '@/components/QueueQrScanner'
import { format } from 'date-fns'

const statusStyles: Record<QueueEntry['status'], string> = {
  waiting: 'bg-gray-50 border-gray-200',
  serving: 'bg-emerald-50 border-emerald-200',
  on_hold: 'bg-amber-50 border-amber-200',
  completed: 'bg-blue-50 border-blue-200',
  skipped: 'bg-gray-50 border-gray-100 opacity-60',
}

export function QueueManagement() {
  const queryClient = useQueryClient()
  const [queueDate, setQueueDate] = useState(todayQueueDate())
  const [search, setSearch] = useState('')
  const [showScanner, setShowScanner] = useState(false)
  const [quickAddPhone, setQuickAddPhone] = useState('')
  const [quickAddBusy, setQuickAddBusy] = useState(false)
  const [holdTargetId, setHoldTargetId] = useState<string | null>(null)
  const [holdReason, setHoldReason] = useState<string>(HOLD_REASONS[0])
  const [busyId, setBusyId] = useState<string | null>(null)

  const todayIso = format(new Date(), 'yyyy-MM-dd')

  const { data: entries = [] } = useQuery({
    queryKey: qk.queue.today(queueDate),
    queryFn: () => fetchTodayQueue(queueDate),
    refetchInterval: 20000, // polling fallback alongside realtime
  })

  const { data: settings } = useQuery({
    queryKey: qk.queue.settings,
    queryFn: fetchQueueSettings,
  })

  const { data: todaysAppointments = [] } = useQuery({
    queryKey: qk.appointments.day(todayIso),
    queryFn: () => fetchDayAppointments(todayIso),
  })

  const { data: patients = [] } = useQuery({
    queryKey: qk.patients.list,
    queryFn: fetchPatientsList,
  })

  const { data: durations = {} } = useQuery({
    queryKey: ['treatment_catalog_items', 'durations'],
    queryFn: fetchProcedureDurations,
  })

  // Midnight rollover: re-derive queueDate on a slow tick so an
  // always-open tab doesn't keep querying yesterday's date forever.
  useEffect(() => {
    const id = window.setInterval(() => {
      const now = todayQueueDate()
      setQueueDate((prev) => (prev !== now ? now : prev))
    }, 60000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    const invalidate = () => queryClient.invalidateQueries({ queryKey: qk.queue.today(queueDate) })
    const unsubscribe = subscribeToQueue(invalidate)
    const stopPolling = pollQueue(invalidate, 20000)
    return () => {
      unsubscribe()
      stopPolling()
    }
  }, [queryClient, queueDate])

  const ordered = useMemo(() => sortQueueEntries(entries), [entries])
  const positions = useMemo(() => computePositions(entries), [entries])
  const etas = useMemo(() => calculateQueueEtas(entries), [entries])
  const etaById = useMemo(() => new Map(etas.map((e) => [e.id, e])), [etas])

  const waiting = ordered.filter((e) => e.status === 'waiting')
  const serving = ordered.filter((e) => e.status === 'serving')
  const onHold = ordered.filter((e) => e.status === 'on_hold')
  const awaitingBilling = ordered.filter((e) => e.status === 'completed' && e.billing_status === 'pending_payment')

  const queuedAppointmentIds = new Set(entries.map((e) => e.appointment_id).filter(Boolean))
  const scheduleCandidates = todaysAppointments.filter(
    (a: any) => (a.status === 'Scheduled' || a.status === 'Confirmed') && !queuedAppointmentIds.has(a.id)
  )

  const searchResults =
    search.trim().length > 0
      ? patients.filter((p: any) =>
          matchesPatientSearch({ name: `${p.first_name} ${p.last_name}`, code: p.patient_code, phone: p.phone }, search)
        )
      : []

  const absentPushdownPlaces = settings?.absent_pushdown_places ?? 3

  const runAction = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id)
    try {
      await fn()
      queryClient.invalidateQueries({ queryKey: qk.queue.today(queueDate) })
    } catch (err) {
      console.error(err)
      alert('That action failed. Please try again.')
    } finally {
      setBusyId(null)
    }
  }

  const addFromAppointment = (appointment: any) => {
    const duration = getProcedureDuration(appointment.type, durations, appointment.duration || 15)
    void runAction('add', () =>
      addQueueEntry({
        patient_id: appointment.patient_id,
        appointment_id: appointment.id,
        patient_name: `${appointment.patients.first_name} ${appointment.patients.last_name}`,
        sort_key: sortKeyForAppointment(appointment.date_time),
        procedure_name: appointment.type,
        estimated_duration_mins: duration,
      })
    )
  }

  const addWalkIn = (patient: any, procedureName?: string) => {
    void runAction('add', () =>
      addQueueEntry({
        patient_id: patient.id,
        patient_name: `${patient.first_name} ${patient.last_name}`,
        sort_key: sortKeyForWalkIn(),
        procedure_name: procedureName ?? null,
        estimated_duration_mins: getProcedureDuration(procedureName, durations),
      })
    )
    setSearch('')
  }

  // Walk-ins who aren't in the system at all yet — a lighter path than the
  // full patient registration flow (AppointmentModal's inline "new
  // patient"): just a name + phone, added as a CO- consultation-only
  // patient (createPatient() from lib/patients.ts, the same shared helper
  // Consultations.tsx uses — patient_type: 'consultation' gets the CO-
  // code assigned server-side, not PT-). Upgradeable to a full patient
  // later from the Consultations page, same as any other CO- patient.
  const handleQuickAddWalkIn = async () => {
    const trimmed = search.trim()
    if (!trimmed) return
    const spaceIdx = trimmed.indexOf(' ')
    const first_name = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx)
    const last_name = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1).trim()

    setQuickAddBusy(true)
    try {
      const newPatient = await createPatient({
        first_name,
        last_name,
        phone: quickAddPhone.trim(),
        patient_type: 'consultation',
      })
      queryClient.invalidateQueries({ queryKey: qk.patients.list })
      addWalkIn(newPatient)
      setQuickAddPhone('')
    } catch (err) {
      console.error(err)
      alert('Could not add this walk-in. Please try again.')
    } finally {
      setQuickAddBusy(false)
    }
  }

  const handleQrScan = async (patientId: string | null, patientCode: string | null) => {
    setShowScanner(false)
    const match = patients.find((p: any) => p.id === patientId || p.patient_code === patientCode)
    if (!match) {
      alert('Could not find that patient. Try searching by name or phone instead.')
      return
    }
    addWalkIn(match)
  }

  // Reception's Call goes through the same shared action as the doctor
  // widget's Call Next (queueApi.callNextPatient) — this is what keeps the
  // two surfaces from disagreeing about what "serving" means. It always
  // calls the canonical front of the queue (urgent first, then sort_key),
  // never an arbitrary clicked row — see the Call button below, which is
  // only rendered on that front entry so it's never misleading about who
  // it will call.
  const handleCallFront = () => {
    if (waiting.length === 0) return
    const front = waiting[0]
    // No specific doctor session on the reception screen — assigned_doctor
    // is left null here and gets set for real once a doctor's floating
    // widget actually calls/resumes this patient.
    void runAction(front.id, () => callNextPatient(entries, null, front.room_number))
  }

  const handleAbsent = (entry: QueueEntry) => {
    void runAction(entry.id, () => markQueueEntryAbsent(entries, entry, absentPushdownPlaces))
  }

  const handleMove = (entry: QueueEntry, direction: 'up' | 'down') => {
    const idx = waiting.findIndex((e) => e.id === entry.id)
    if (idx === -1) return
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= waiting.length) return
    const afterId = direction === 'up' ? (targetIdx - 1 >= 0 ? waiting[targetIdx - 1].id : null) : waiting[targetIdx].id
    void runAction(entry.id, () => moveQueueEntry(entries, entry.id, afterId))
  }

  const handleDelete = (entry: QueueEntry) => {
    if (!canDelete()) {
      alert("You don't have permission to remove queue entries.")
      return
    }
    void runAction(entry.id, () => deleteQueueEntry(entry.id))
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-text-primary flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          Patient Queue
        </h1>
        <a
          href="/queue-display"
          target="_blank"
          rel="noreferrer"
          className="text-sm font-semibold text-primary hover:underline"
        >
          Open Display Board
        </a>
      </div>

      {(awaitingBilling.length > 0) && (
        <section>
          <h2 className="text-xs font-bold uppercase tracking-wider text-blue-700 mb-2 flex items-center gap-1">
            <Banknote className="w-3.5 h-3.5" />
            Awaiting Billing & Medicine Dispense ({awaitingBilling.length})
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {awaitingBilling.map((e) => (
              <div key={e.id} className="p-3 rounded-xl border bg-blue-50 border-blue-200 flex items-center justify-between gap-2">
                <div className="truncate">
                  <div className="font-bold text-sm truncate">#{e.serial_number} {e.patient_name}</div>
                  <div className="text-xs text-blue-700 truncate">{e.procedure_name || 'Consultation'}</div>
                </div>
                <button
                  disabled={busyId === e.id}
                  onClick={() => runAction(e.id, () => markBillingSettled(e.id))}
                  className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shrink-0"
                >
                  Settled
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        {/* Left: live queue */}
        <section className="space-y-4">
          {serving.length > 0 && (
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-emerald-700 mb-2">Now in Consultation</h2>
              <div className="space-y-2">
                {serving.map((e) => (
                  <div key={e.id} className={`p-3 rounded-xl border ${statusStyles.serving} flex items-center justify-between gap-2`}>
                    <div className="truncate">
                      <div className="font-bold text-sm truncate">
                        #{e.serial_number} {e.patient_name}{' '}
                        {e.priority === 'urgent' && <span className="text-[10px] font-black uppercase text-red-600 ml-1">Urgent</span>}
                      </div>
                      <div className="text-xs text-text-secondary truncate">
                        {e.procedure_name || 'Consultation'} {e.room_number ? `· ${e.room_number}` : ''}
                      </div>
                    </div>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        disabled={busyId === e.id}
                        onClick={() => setHoldTargetId(e.id)}
                        className="p-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg"
                        title="Hold for LA / X-Ray"
                      >
                        <PauseCircle className="w-4 h-4" />
                      </button>
                      <button
                        disabled={busyId === e.id}
                        onClick={() => runAction(e.id, () => completeAndBillEntry(e.id))}
                        className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg"
                        title="Complete & Bill"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {onHold.length > 0 && (
            <div>
              <h2 className="text-xs font-bold uppercase tracking-wider text-amber-700 mb-2">In Preparation / Awaiting Anesthesia</h2>
              <div className="space-y-2">
                {onHold.map((e) => (
                  <div key={e.id} className={`p-3 rounded-xl border ${statusStyles.on_hold} flex items-center justify-between gap-2`}>
                    <div className="truncate">
                      <div className="font-bold text-sm truncate">#{e.serial_number} {e.patient_name}</div>
                      <div className="text-xs text-amber-700 truncate">{e.hold_reason}</div>
                    </div>
                    <button
                      disabled={busyId === e.id}
                      onClick={() => runAction(e.id, () => resumeQueueEntry(e.id))}
                      className="px-2.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shrink-0"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Resume
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2">
              Waiting in Lounge ({waiting.length})
            </h2>
            {waiting.length === 0 ? (
              <div className="text-sm text-text-muted text-center py-6 bg-surface-subtle rounded-xl border border-gray-100">
                No one is waiting.
              </div>
            ) : (
              <div className="space-y-2">
                {waiting.map((e, idx) => {
                  const eta = etaById.get(e.id)
                  return (
                    <div key={e.id} className={`p-3 rounded-xl border ${statusStyles.waiting} flex items-center justify-between gap-2`}>
                      <div className="truncate">
                        <div className="font-bold text-sm truncate flex items-center gap-1.5">
                          <span className="w-6 h-6 rounded-lg bg-primary/10 text-primary font-mono font-bold text-xs flex items-center justify-center shrink-0">
                            {positions.get(e.id)}
                          </span>
                          #{e.serial_number} {e.patient_name}
                          {e.priority === 'urgent' && <span className="text-[10px] font-black uppercase text-red-600">Urgent</span>}
                          {e.absent_marks > 0 && (
                            <span className="text-[10px] font-bold text-amber-700 flex items-center gap-0.5" title="Marked absent — pushed down">
                              <AlertTriangle className="w-3 h-3" /> arrived late
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-text-secondary truncate flex items-center gap-1">
                          {e.procedure_name || 'Consultation'}
                          {eta && (
                            <span className="text-teal-700 font-semibold flex items-center gap-0.5">
                              <Clock className="w-3 h-3" /> ~{eta.etaMinutesFromNow}m
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button disabled={idx === 0 || busyId === e.id} onClick={() => handleMove(e, 'up')} className="p-1.5 border rounded-lg disabled:opacity-30" title="Move up">
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button disabled={idx === waiting.length - 1 || busyId === e.id} onClick={() => handleMove(e, 'down')} className="p-1.5 border rounded-lg disabled:opacity-30" title="Move down">
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button disabled={busyId === e.id} onClick={() => handleAbsent(e)} className="p-1.5 border border-amber-300 text-amber-700 rounded-lg" title="Mark absent (push down)">
                          <AlertTriangle className="w-3.5 h-3.5" />
                        </button>
                        {/* Call is only ever shown on the front of the queue — the
                            action always calls the canonical next patient, so
                            showing it on any other row would be misleading about
                            who it actually calls. */}
                        {idx === 0 && (
                          <button disabled={busyId === e.id} onClick={handleCallFront} className="p-1.5 bg-primary text-white rounded-lg" title="Call">
                            <Play className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canDelete() && (
                          <button disabled={busyId === e.id} onClick={() => handleDelete(e)} className="p-1.5 border border-red-200 text-red-600 rounded-lg" title="Remove">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </section>

        {/* Right: today's schedule + walk-in search */}
        <section className="space-y-4">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2">Today's Schedule</h2>
            {scheduleCandidates.length === 0 ? (
              <div className="text-xs text-text-muted py-3 text-center bg-surface-subtle rounded-xl border border-gray-100">
                Nothing left to check in.
              </div>
            ) : (
              <div className="space-y-1.5">
                {scheduleCandidates.map((a: any) => (
                  <div key={a.id} className="p-2.5 rounded-lg border border-gray-200 flex items-center justify-between gap-2">
                    <div className="truncate">
                      <div className="text-sm font-semibold truncate">
                        {a.patients.first_name} {a.patients.last_name}
                      </div>
                      <div className="text-[11px] text-text-muted truncate">
                        {format(new Date(a.date_time), 'h:mm a')} · {a.type}
                      </div>
                    </div>
                    <button
                      onClick={() => addFromAppointment(a)}
                      className="px-2.5 py-1 bg-primary/10 text-primary rounded-lg text-xs font-bold shrink-0"
                    >
                      Add to Queue
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h2 className="text-xs font-bold uppercase tracking-wider text-text-secondary mb-2">Walk-in</h2>
            <div className="flex gap-2 mb-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search patient by name/phone/code"
                  className="w-full pl-8 pr-2 py-2 text-sm border border-gray-200 rounded-lg"
                />
              </div>
              <button onClick={() => setShowScanner(true)} className="p-2 border border-gray-200 rounded-lg" title="Scan patient QR">
                <QrCode className="w-4 h-4" />
              </button>
            </div>
            {searchResults.length > 0 && (
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                {searchResults.slice(0, 8).map((p: any) => (
                  <button
                    key={p.id}
                    onClick={() => addWalkIn(p)}
                    className="w-full flex items-center justify-between gap-2 p-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-left"
                  >
                    <span className="text-sm truncate">{p.first_name} {p.last_name}</span>
                    <UserPlus className="w-4 h-4 text-primary shrink-0" />
                  </button>
                ))}
              </div>
            )}
            {search.trim().length > 1 && searchResults.length === 0 && (
              <div className="p-3 rounded-lg border border-dashed border-gray-300 bg-surface-subtle">
                <p className="text-xs text-text-muted mb-2">
                  No existing patient matches "{search.trim()}". Add as a walk-in not yet in the system —
                  registered as a consultation-only patient, upgradeable to a full record later.
                </p>
                <div className="flex gap-2">
                  <input
                    value={quickAddPhone}
                    onChange={(e) => setQuickAddPhone(e.target.value)}
                    placeholder="Phone number"
                    className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded-lg"
                  />
                  <button
                    disabled={quickAddBusy || !quickAddPhone.trim()}
                    onClick={handleQuickAddWalkIn}
                    className="px-3 py-1.5 bg-primary text-white rounded-lg text-xs font-bold disabled:opacity-40 shrink-0"
                  >
                    {quickAddBusy ? 'Adding…' : `Quick Add "${search.trim()}"`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {holdTargetId && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-lg border border-gray-200 w-full max-w-sm p-4">
            <h3 className="font-bold text-sm mb-3">Hold reason</h3>
            <div className="space-y-1.5 mb-4">
              {HOLD_REASONS.map((reason) => (
                <button
                  key={reason}
                  onClick={() => setHoldReason(reason)}
                  className={`w-full text-left p-2 rounded-lg text-xs font-semibold border ${
                    holdReason === reason ? 'bg-amber-100 border-amber-400 text-amber-900' : 'bg-white border-gray-200'
                  }`}
                >
                  {reason}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => setHoldTargetId(null)} className="flex-1 py-1.5 rounded-lg border text-xs font-semibold">
                Cancel
              </button>
              <button
                onClick={() => {
                  const id = holdTargetId
                  setHoldTargetId(null)
                  void runAction(id, () => holdQueueEntry(id, holdReason))
                }}
                className="flex-1 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold"
              >
                Confirm Hold
              </button>
            </div>
          </div>
        </div>
      )}

      {showScanner && <QueueQrScanner onScan={handleQrScan} onClose={() => setShowScanner(false)} />}
    </div>
  )
}
