import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Gift, Send, CheckCircle2, ChevronDown, ChevronUp, Phone, User } from 'lucide-react'
import { qk } from '@/repositories/keys'
import { fetchCelebrationPatients } from '@/repositories/patientsRepo'
import { extractCelebrations, fetchSentCelebrations, type CelebrationEvent } from '@/lib/celebrationReminders'
import { CelebrationGreetingModal } from '@/components/CelebrationGreetingModal'

type TimeframeFilter = 'today' | 'upcoming' | 'month'

/**
 * Dashboard card: upcoming patient birthdays & anniversaries with a
 * one-click WhatsApp greeting. Styled after TreatmentFollowUpCard (light
 * card, collapsible header, count chip) rather than any dark theme. Renders
 * nothing when there is nothing to show, same as that card.
 */
export function CelebrationReminderWidget() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<TimeframeFilter>('today')
  const [selectedEvent, setSelectedEvent] = useState<CelebrationEvent | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const [sentKeys, setSentKeys] = useState<Set<string> | undefined>(undefined)

  const { data: patients } = useQuery({
    queryKey: qk.patients.celebrations,
    queryFn: fetchCelebrationPatients,
  })

  async function refreshSent() {
    const keys = await fetchSentCelebrations()
    setSentKeys(keys)
  }

  useEffect(() => {
    refreshSent()
  }, [])

  const allEvents = useMemo(() => extractCelebrations(patients || [], sentKeys), [patients, sentKeys])

  const todayEvents = useMemo(() => allEvents.filter((e) => e.isToday), [allEvents])
  const upcomingEvents = useMemo(() => allEvents.filter((e) => e.daysUntil > 0 && e.daysUntil <= 7), [allEvents])
  const monthEvents = useMemo(() => allEvents.filter((e) => e.daysUntil <= 30), [allEvents])

  const displayedEvents =
    filter === 'today' ? todayEvents : filter === 'upcoming' ? upcomingEvents : monthEvents

  if (allEvents.length === 0) return null

  return (
    <div className="bg-card rounded-lg shadow-sm border border-pink-200 overflow-hidden">
      <button
        onClick={() => setCollapsed((prev) => !prev)}
        className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-pink-50 text-pink-800"
      >
        <div className="flex items-center gap-2">
          <Gift className="w-4 h-4" />
          <span className="font-medium text-sm">Celebrations &amp; Greetings</span>
          {todayEvents.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-xs font-semibold bg-pink-200 text-pink-900">
              {todayEvents.length} today
            </span>
          )}
        </div>
        {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
      </button>

      {!collapsed && (
        <div className="p-3 space-y-3">
          {/* Filter pills */}
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFilter('today')}
              className={`px-3 py-1 text-xs font-semibold rounded-full border transition-colors flex items-center gap-1.5 ${
                filter === 'today'
                  ? 'bg-primary/10 border-primary/30 text-primary-deep'
                  : 'bg-gray-50 border-gray-200 text-text-secondary hover:text-text-primary'
              }`}
            >
              Today
              <span className="text-[10px] px-1.5 rounded-full bg-white/70">{todayEvents.length}</span>
            </button>
            <button
              type="button"
              onClick={() => setFilter('upcoming')}
              className={`px-3 py-1 text-xs font-semibold rounded-full border transition-colors flex items-center gap-1.5 ${
                filter === 'upcoming'
                  ? 'bg-primary/10 border-primary/30 text-primary-deep'
                  : 'bg-gray-50 border-gray-200 text-text-secondary hover:text-text-primary'
              }`}
            >
              7 Days
              <span className="text-[10px] px-1.5 rounded-full bg-white/70">{upcomingEvents.length}</span>
            </button>
            <button
              type="button"
              onClick={() => setFilter('month')}
              className={`px-3 py-1 text-xs font-semibold rounded-full border transition-colors flex items-center gap-1.5 ${
                filter === 'month'
                  ? 'bg-primary/10 border-primary/30 text-primary-deep'
                  : 'bg-gray-50 border-gray-200 text-text-secondary hover:text-text-primary'
              }`}
            >
              Month
              <span className="text-[10px] px-1.5 rounded-full bg-white/70">{monthEvents.length}</span>
            </button>
          </div>

          {displayedEvents.length === 0 ? (
            <div className="text-center py-6 px-4 bg-gray-50 rounded-lg border border-dashed border-gray-200">
              <p className="text-xs font-medium text-text-primary">
                No {filter === 'today' ? 'celebrations today' : 'upcoming celebrations'}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200 -mx-3">
              {displayedEvents.map((evt) => {
                const isBirthday = evt.type === 'birthday'
                const badgeLabel = evt.isToday
                  ? isBirthday ? '🎂 Birthday Today' : '💐 Anniversary Today'
                  : isBirthday
                  ? `🎂 Birthday in ${evt.daysUntil}d`
                  : `💐 Anniversary in ${evt.daysUntil}d`

                return (
                  <div key={evt.id} className="px-3 py-2.5 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary-deep flex items-center justify-center font-semibold text-xs shrink-0">
                        {evt.patientName[0]?.toUpperCase() || <User className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <button
                            type="button"
                            onClick={() => navigate(`/patients/${evt.patientId}`)}
                            className="font-medium text-sm text-text-primary hover:text-primary-deep transition-colors truncate max-w-[160px]"
                          >
                            {evt.patientName}
                          </button>
                          <span
                            className={`inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                              evt.isToday
                                ? isBirthday
                                  ? 'bg-pink-100 text-pink-800'
                                  : 'bg-rose-100 text-rose-800'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {badgeLabel}
                          </span>
                        </div>
                        <p className="text-xs text-text-secondary mt-0.5">
                          {evt.phone ? (
                            <span className="font-mono flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {evt.phone}
                            </span>
                          ) : (
                            <span className="text-amber-600">No phone number</span>
                          )}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {evt.isSent && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-1 rounded-lg">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Sent
                        </span>
                      )}
                      <button
                        onClick={() => setSelectedEvent(evt)}
                        disabled={!evt.phone}
                        className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-white bg-primary hover:bg-primary-deep disabled:bg-gray-300 disabled:cursor-not-allowed rounded-lg transition-colors"
                      >
                        <Send className="w-3.5 h-3.5" />
                        {evt.isSent ? 'Send Again' : 'Send'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {selectedEvent && (
        <CelebrationGreetingModal
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onSent={() => refreshSent()}
        />
      )}
    </div>
  )
}
