import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { Play, Check, ChevronDown, MonitorPlay, PauseCircle, RotateCcw, Flame, X, DoorOpen } from 'lucide-react'
import {
  getQueueEntries,
  todayQueueDate,
  callNextPatient,
  holdQueueEntry,
  resumeQueueEntry,
  completeAndBillEntry,
  subscribeToQueue,
  pollQueue,
  HOLD_REASONS,
  type QueueEntry,
} from '@/lib/queueApi'
import { calculateDoctorBacklogMins } from '@/lib/queueEstimation'
import { sortQueueEntries } from '@/lib/queueOrder'
import { getAppRole, getAppUser } from '@/lib/appSession'

function formatBacklog(mins: number): string {
  if (mins <= 0) return '0m'
  const h = Math.floor(mins / 60)
  const m = Math.round(mins % 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

export function QueueFloatingWidget() {
  // Hooks run unconditionally, before any early return — the sandbox this
  // was ported from returned null (based on role) ABOVE its useState calls,
  // a Rules-of-Hooks violation that throws "Rendered fewer hooks than
  // expected" if getAppRole() ever changes between renders without a
  // remount.
  const [entries, setEntries] = useState<QueueEntry[]>([])
  const [expanded, setExpanded] = useState(false)
  const [roomNumber, setRoomNumber] = useState<string>(() => localStorage.getItem('clinicmx_doctor_room') || 'Room 1')
  const [holdTargetId, setHoldTargetId] = useState<string | null>(null)
  const [selectedHoldReason, setSelectedHoldReason] = useState<string>(HOLD_REASONS[0])
  const [busyId, setBusyId] = useState<string | null>(null)
  const location = useLocation()

  const role = getAppRole()
  const user = getAppUser()

  useEffect(() => {
    if (role !== 'doctor' && role !== 'admin') return
    let isSubscribed = true

    const load = () => {
      getQueueEntries(todayQueueDate())
        .then((data) => {
          if (isSubscribed) setEntries(data)
        })
        .catch(console.error)
    }
    load()

    const unsubscribeRealtime = subscribeToQueue(load)
    // Safety net alongside realtime — see queueApi.ts's subscribeToQueue doc
    // comment on why an always-on/rarely-reloaded surface shouldn't rely on
    // the socket alone.
    const stopPolling = pollQueue(load, 20000)

    return () => {
      isSubscribed = false
      unsubscribeRealtime()
      stopPolling()
    }
  }, [role])

  if (role !== 'doctor' && role !== 'admin') return null

  // bottom-36 clears PatientProfile's own bottom-20 quick-add FAB and the
  // fixed bottom tab bar beneath it — but this widget is mounted globally
  // (DashboardLayout renders it on every page), and that extra offset has
  // no matching bottom bar to clear anywhere else. On pages with normal
  // scrolling content (e.g. Patient Queue), a fixed bottom-36 instead sits
  // mid-page and overlaps whatever card happens to scroll underneath it
  // (found live, 2026-08-16). Scope the taller offset to the one route
  // that actually needs it.
  const onPatientProfile = location.pathname.startsWith('/patients/')
  const bottomOffsetClass = onPatientProfile ? 'bottom-36 md:bottom-6' : 'bottom-6'

  const handleRoomChange = (newRoom: string) => {
    setRoomNumber(newRoom)
    localStorage.setItem('clinicmx_doctor_room', newRoom)
  }

  const doctorId = user?.id ?? null
  const waiting = sortQueueEntries(entries.filter((e) => e.status === 'waiting'))
  const serving = entries.filter((e) => e.status === 'serving' && e.assigned_doctor === doctorId)
  const onHold = entries.filter((e) => e.status === 'on_hold' && e.assigned_doctor === doctorId)
  const backlogMins = doctorId ? calculateDoctorBacklogMins(entries, doctorId) : 0

  // None of these handlers had error handling before — a failed write
  // (RLS denial, dropped connection, anything) rejected silently with no
  // re-render and no message, which looked exactly like "the button does
  // nothing" (reported live, 2026-08-15 — Resume specifically, but the gap
  // was the same across every action here). runAction surfaces the real
  // failure instead of swallowing it, matching QueueManagement.tsx's
  // existing convention for the same actions on the reception screen.
  const runAction = async (id: string, fn: () => Promise<unknown>) => {
    setBusyId(id)
    try {
      await fn()
    } catch (err) {
      console.error(err)
      alert(`That action failed: ${err instanceof Error ? err.message : 'unknown error'}`)
    } finally {
      setBusyId(null)
    }
  }

  const handleCallNext = () => {
    if (!doctorId || waiting.length === 0) return
    void runAction('call-next', async () => {
      await callNextPatient(entries, doctorId, roomNumber)
      setExpanded(true)
    })
  }

  const handleCompleteCurrent = (id: string) => {
    void runAction(id, () => completeAndBillEntry(id))
  }

  const handleConfirmHold = () => {
    if (!holdTargetId) return
    const id = holdTargetId
    void runAction(id, async () => {
      await holdQueueEntry(id, selectedHoldReason)
      setHoldTargetId(null)
    })
  }

  const handleResume = (id: string) => {
    if (!doctorId) return
    void runAction(id, async () => {
      // Resuming brings this patient back into the chair — anyone else
      // this doctor currently has in 'serving' is completed & billed
      // first, same rule as Call Next, via the shared action so the two
      // paths can't drift.
      const current = entries.find((e) => e.status === 'serving' && e.assigned_doctor === doctorId)
      if (current) await completeAndBillEntry(current.id)
      await resumeQueueEntry(id)
    })
  }

  if (!expanded) {
    return (
      <div className={`fixed ${bottomOffsetClass} right-6 z-50`}>
        <button
          onClick={() => setExpanded(true)}
          className="bg-white rounded-full p-4 shadow-elevation-lg border border-gray-200 text-primary hover:bg-gray-50 transition-all flex items-center gap-3 relative group"
          title="Open Queue Caller"
        >
          <MonitorPlay className="w-6 h-6 text-primary" />
          {waiting.length > 0 && (
            <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[11px] font-black w-5 h-5 rounded-full flex items-center justify-center shadow-md animate-pulse">
              {waiting.length}
            </span>
          )}
        </button>
      </div>
    )
  }

  return (
    <div className={`fixed ${bottomOffsetClass} right-6 z-50 w-88 max-w-[90vw] bg-white rounded-3xl shadow-elevation-high border border-gray-200/90 overflow-hidden flex flex-col animate-in fade-in slide-in-from-bottom-3 duration-200`}>
      <div
        className="bg-primary text-white p-3.5 px-4 flex justify-between items-center cursor-pointer shadow-sm"
        onClick={() => setExpanded(false)}
      >
        <div className="font-bold text-sm flex items-center gap-2">
          <MonitorPlay className="w-4 h-4" />
          <span>Queue Calling Control</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono font-bold bg-white/20 px-2 py-0.5 rounded-md text-white/90">
            Backlog: ~{formatBacklog(backlogMins)}
          </span>
          <ChevronDown className="w-5 h-5 opacity-80 hover:opacity-100" />
        </div>
      </div>

      <div className="px-4 py-2 bg-surface-subtle border-b border-gray-100 flex items-center justify-between text-xs">
        <span className="font-semibold text-text-secondary flex items-center gap-1">
          <DoorOpen className="w-3.5 h-3.5 text-primary" />
          My Chamber:
        </span>
        <select
          value={roomNumber}
          onChange={(e) => handleRoomChange(e.target.value)}
          className="px-2 py-0.5 rounded-lg border border-gray-200 bg-white text-xs font-bold text-text-primary outline-none focus:border-primary"
        >
          <option value="Room 1">Room 1</option>
          <option value="Room 2">Room 2</option>
          <option value="Chamber A">Chamber A</option>
          <option value="Chamber B">Chamber B</option>
          <option value="Dental Chair 1">Chair 1</option>
          <option value="Dental Chair 2">Chair 2</option>
        </select>
      </div>

      <div className="p-4 flex flex-col gap-3.5 max-h-[75vh] overflow-y-auto">
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 mb-1.5 flex items-center gap-1">
            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
            Currently In Chamber
          </div>

          {serving.length > 0 ? (
            <div className="space-y-2">
              {serving.map((s) => (
                <div key={s.id} className="bg-emerald-50/90 border border-emerald-200 rounded-2xl p-3 shadow-sm">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-lg bg-emerald-600 text-white font-mono font-bold text-xs flex items-center justify-center shrink-0">
                      #{s.serial_number}
                    </span>
                    <div className="font-bold text-emerald-950 text-base truncate flex-1">{s.patient_name}</div>
                  </div>

                  {s.procedure_name && <div className="text-xs text-emerald-800 font-medium mt-1">{s.procedure_name}</div>}

                  <div className="grid grid-cols-2 gap-1.5 mt-2.5">
                    <button
                      disabled={busyId === s.id}
                      onClick={() => setHoldTargetId(s.id)}
                      className="py-1.5 px-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1 transition-colors shadow-sm disabled:opacity-40"
                      title="Hold for Local Anesthesia or X-Ray"
                    >
                      <PauseCircle className="w-3.5 h-3.5" />
                      Hold (LA)
                    </button>

                    <button
                      disabled={busyId === s.id}
                      onClick={() => handleCompleteCurrent(s.id)}
                      className="py-1.5 px-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1 transition-colors shadow-sm disabled:opacity-40"
                      title="Mark Complete & Hand off to Front Desk Billing"
                    >
                      <Check className="w-3.5 h-3.5" />
                      {busyId === s.id ? 'Working…' : 'Complete & Bill'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-text-muted text-xs text-center py-2.5 bg-surface-subtle/60 rounded-xl border border-gray-100">
              No patient currently in room
            </div>
          )}
        </div>

        {onHold.length > 0 && (
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-600 mb-1.5 flex items-center gap-1">
              <Flame className="w-3 h-3 text-amber-500" />
              Awaiting Anesthesia / Prep ({onHold.length})
            </div>

            <div className="space-y-1.5">
              {onHold.map((h) => (
                <div
                  key={h.id}
                  className="p-2.5 rounded-xl bg-amber-50/70 border border-amber-200 flex items-center justify-between gap-2"
                >
                  <div className="truncate">
                    <div className="font-bold text-xs text-text-primary truncate">
                      #{h.serial_number} {h.patient_name}
                    </div>
                    <div className="text-[10px] text-amber-800 font-medium truncate">{h.hold_reason || 'Local Anesthesia'}</div>
                  </div>

                  <button
                    disabled={busyId === h.id}
                    onClick={() => handleResume(h.id)}
                    className="px-2.5 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-xs font-bold flex items-center gap-1 shrink-0 shadow-sm disabled:opacity-40"
                    title="Resume consultation"
                  >
                    <RotateCcw className="w-3 h-3" />
                    {busyId === h.id ? 'Working…' : 'Resume'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <hr className="border-gray-100" />

        <div className="flex items-center justify-between gap-2">
          <div className="truncate flex-1">
            <div className="text-[10px] font-bold uppercase text-text-muted tracking-wider">Up Next in Queue</div>
            <div className="font-bold text-text-primary text-sm truncate">
              {waiting.length > 0 ? (
                <>
                  #{waiting[0].serial_number} {waiting[0].patient_name}
                  {waiting[0].priority === 'urgent' && (
                    <span className="ml-1.5 text-[10px] font-black uppercase text-red-600">Urgent</span>
                  )}
                </>
              ) : (
                <span className="text-text-muted font-normal text-xs">Queue is empty</span>
              )}
            </div>
            {waiting.length > 0 && waiting[0].procedure_name && (
              <div className="text-[11px] text-teal-700 font-semibold truncate">
                {waiting[0].procedure_name} ({waiting[0].estimated_duration_mins || 15}m)
              </div>
            )}
            {waiting.length > 1 && <div className="text-[10px] text-text-secondary font-medium">+{waiting.length - 1} more waiting</div>}
          </div>

          <button
            onClick={handleCallNext}
            disabled={waiting.length === 0 || busyId === 'call-next'}
            className="px-4 py-2.5 bg-primary hover:bg-primary-dark text-white font-bold text-xs rounded-xl disabled:opacity-40 flex items-center gap-1.5 transition-colors shadow-sm shrink-0"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            {busyId === 'call-next' ? 'Working…' : 'Call Next'}
          </button>
        </div>
      </div>

      {holdTargetId && (
        <div className="absolute inset-0 bg-white/95 backdrop-blur-sm z-50 p-4 flex flex-col justify-between animate-in fade-in">
          <div>
            <div className="flex justify-between items-center mb-2">
              <h4 className="text-xs font-bold uppercase text-amber-700 flex items-center gap-1">
                <PauseCircle className="w-4 h-4" />
                Hold Consultation
              </h4>
              <button onClick={() => setHoldTargetId(null)} className="p-1 text-gray-400 hover:text-gray-600">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-text-secondary mb-3">
              Patient will be set on hold while anesthesia takes effect. You can call the next patient.
            </p>
            <div className="space-y-1.5">
              {HOLD_REASONS.map((reason) => (
                <button
                  key={reason}
                  onClick={() => setSelectedHoldReason(reason)}
                  className={`w-full text-left p-2 rounded-lg text-xs font-semibold border transition-colors ${
                    selectedHoldReason === reason
                      ? 'bg-amber-100 border-amber-400 text-amber-900 font-bold'
                      : 'bg-white border-gray-200 hover:bg-gray-50 text-text-primary'
                  }`}
                >
                  {reason}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2 border-t border-gray-100">
            <button
              onClick={() => setHoldTargetId(null)}
              className="flex-1 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-text-secondary"
            >
              Cancel
            </button>
            <button
              disabled={busyId === holdTargetId}
              onClick={handleConfirmHold}
              className="flex-1 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold shadow-sm disabled:opacity-40"
            >
              {busyId === holdTargetId ? 'Working…' : 'Confirm Hold'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
