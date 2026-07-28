import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format, parseISO } from 'date-fns'
import { Clock, Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import {
  addRecurringWindow,
  loadRecurringWindows,
  loadUpcomingOverrides,
  removeDateOverride,
  removeScheduleWindow,
  setDateOverride,
  type OverrideWindowRow,
  type RecurringWindowRow,
} from '@/lib/appointmentSchedule'
import type { ScheduleWindow } from '@/lib/appointmentSlots'

const WEEKDAYS = [
  { value: 0, label: 'Sunday' },
  { value: 1, label: 'Monday' },
  { value: 2, label: 'Tuesday' },
  { value: 3, label: 'Wednesday' },
  { value: 4, label: 'Thursday' },
  { value: 5, label: 'Friday' },
  { value: 6, label: 'Saturday' },
]

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const hour = Math.floor(i / 2)
  const minute = i % 2 === 0 ? 0 : 30
  const label = new Date(2000, 0, 1, hour, minute).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  return { hour, minute, value: `${hour}:${minute}`, label }
})

function timeValue(hour: number, minute: number) {
  return `${hour}:${minute}`
}

function formatWindow(w: ScheduleWindow) {
  const start = TIME_OPTIONS.find((o) => o.hour === w.start_hour && o.minute === w.start_minute)?.label
  const end = TIME_OPTIONS.find((o) => o.hour === w.end_hour && o.minute === w.end_minute)?.label
  return `${start} – ${end}`
}

function TimeSelect({
  hour,
  minute,
  onChange,
  label,
}: {
  hour: number
  minute: number
  onChange: (hour: number, minute: number) => void
  label: string
}) {
  return (
    <select
      aria-label={label}
      value={timeValue(hour, minute)}
      onChange={(e) => {
        const opt = TIME_OPTIONS.find((o) => o.value === e.target.value)
        if (opt) onChange(opt.hour, opt.minute)
      }}
      className="px-2 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
    >
      {TIME_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

/** Inline "start – end [+ Add]" row used both in the weekly editor and the override form. */
function AddWindowRow({ onAdd, disabled }: { onAdd: (window: ScheduleWindow) => void; disabled?: boolean }) {
  const [start, setStart] = useState({ hour: 9, minute: 0 })
  const [end, setEnd] = useState({ hour: 17, minute: 0 })
  const [error, setError] = useState('')

  function handleAdd() {
    if (start.hour * 60 + start.minute >= end.hour * 60 + end.minute) {
      setError('End time must be after start time.')
      return
    }
    setError('')
    onAdd({ start_hour: start.hour, start_minute: start.minute, end_hour: end.hour, end_minute: end.minute })
  }

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        <TimeSelect label="Start time" hour={start.hour} minute={start.minute} onChange={(h, m) => setStart({ hour: h, minute: m })} />
        <span className="text-sm text-gray-500">to</span>
        <TimeSelect label="End time" hour={end.hour} minute={end.minute} onChange={(h, m) => setEnd({ hour: h, minute: m })} />
        <button
          type="button"
          onClick={handleAdd}
          disabled={disabled}
          className="flex items-center gap-1 px-2 py-1.5 text-sm font-medium text-primary bg-primary/10 hover:bg-primary/15 rounded-lg transition disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </button>
      </div>
      {error && <p className="text-xs text-error mt-1">{error}</p>}
    </div>
  )
}

function WindowChip({ window, onRemove }: { window: ScheduleWindow; onRemove: () => void }) {
  return (
    <div className="flex items-center justify-between bg-gray-50 border border-gray-200 rounded-lg px-3 py-1.5 text-sm">
      <span>{formatWindow(window)}</span>
      <button type="button" onClick={onRemove} className="text-gray-400 hover:text-error ml-2" title="Remove">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}

function WeeklyDayEditor({
  dayValue,
  dayLabel,
  windows,
  onAdd,
  onRemove,
  isBusy,
}: {
  dayValue: number
  dayLabel: string
  windows: RecurringWindowRow[]
  onAdd: (dayValue: number, window: ScheduleWindow) => void
  onRemove: (id: string) => void
  isBusy: boolean
}) {
  return (
    <div className="border border-gray-200 rounded-lg p-3">
      <div className="font-medium text-sm mb-2">{dayLabel}</div>
      {windows.length === 0 ? (
        <p className="text-xs text-gray-400 mb-2">Closed — no windows set</p>
      ) : (
        <div className="space-y-1.5 mb-2">
          {windows.map((w) => (
            <WindowChip key={w.id} window={w} onRemove={() => onRemove(w.id)} />
          ))}
        </div>
      )}
      <AddWindowRow disabled={isBusy} onAdd={(w) => onAdd(dayValue, w)} />
    </div>
  )
}

function OverrideForm({ onSave, isBusy }: { onSave: (date: string, isClosed: boolean, windows: ScheduleWindow[]) => void; isBusy: boolean }) {
  const [date, setDate] = useState('')
  const [isClosed, setIsClosed] = useState(false)
  const [windows, setWindows] = useState<ScheduleWindow[]>([])
  const [error, setError] = useState('')

  function handleSave() {
    if (!date) {
      setError('Pick a date first.')
      return
    }
    if (!isClosed && windows.length === 0) {
      setError('Add at least one window, or check "Closed all day".')
      return
    }
    setError('')
    onSave(date, isClosed, windows)
    setDate('')
    setIsClosed(false)
    setWindows([])
  }

  return (
    <div className="border border-gray-200 rounded-lg p-3 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isClosed} onChange={(e) => setIsClosed(e.target.checked)} />
          Closed all day
        </label>
      </div>

      {!isClosed && (
        <div className="space-y-2">
          {windows.length > 0 && (
            <div className="space-y-1.5">
              {windows.map((w, i) => (
                <WindowChip key={i} window={w} onRemove={() => setWindows((prev) => prev.filter((_, idx) => idx !== i))} />
              ))}
            </div>
          )}
          <AddWindowRow onAdd={(w) => setWindows((prev) => [...prev, w])} />
        </div>
      )}

      {error && <p className="text-xs text-error">{error}</p>}

      <Button type="button" size="sm" onClick={handleSave} disabled={isBusy}>
        {isBusy ? 'Saving…' : 'Save Override'}
      </Button>
    </div>
  )
}

export function ClinicHoursTab() {
  const queryClient = useQueryClient()

  const { data: recurring = [], isPending: recurringPending } = useQuery({
    queryKey: ['schedule_recurring'],
    queryFn: loadRecurringWindows,
  })
  const { data: overrides = [], isPending: overridesPending } = useQuery({
    queryKey: ['schedule_overrides'],
    queryFn: loadUpcomingOverrides,
  })

  function refreshRecurring() {
    queryClient.invalidateQueries({ queryKey: ['schedule_recurring'] })
  }
  function refreshOverrides() {
    queryClient.invalidateQueries({ queryKey: ['schedule_overrides'] })
  }

  const addWindowMutation = useMutation({
    mutationFn: ({ day, window }: { day: number; window: ScheduleWindow }) => addRecurringWindow(day, window),
    onSuccess: refreshRecurring,
  })
  const removeWindowMutation = useMutation({
    mutationFn: (id: string) => removeScheduleWindow(id),
    onSuccess: refreshRecurring,
  })
  const saveOverrideMutation = useMutation({
    mutationFn: ({ date, isClosed, windows }: { date: string; isClosed: boolean; windows: ScheduleWindow[] }) =>
      setDateOverride(date, isClosed, windows),
    onSuccess: refreshOverrides,
  })
  const removeOverrideMutation = useMutation({
    mutationFn: ({ id, date }: { id: string; date: string }) => removeDateOverride(id, date),
    onSuccess: refreshOverrides,
  })

  const windowsByDay: Record<number, RecurringWindowRow[]> = {}
  for (const w of recurring) {
    if (!windowsByDay[w.day_of_week]) windowsByDay[w.day_of_week] = []
    windowsByDay[w.day_of_week].push(w)
  }

  return (
    <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 space-y-8">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Clock className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="font-display text-lg font-bold">Clinic Hours</h3>
          <p className="text-sm text-text-secondary">
            Controls which appointment time slots staff can book — appointments already booked outside
            these windows are not affected. Appointment slots are 30 minutes each.
          </p>
        </div>
      </div>

      <div>
        <h4 className="font-semibold text-sm mb-1">Weekly Hours</h4>
        <p className="text-xs text-text-secondary mb-3">
          Each day can have multiple windows (e.g. 10:00 AM–2:00 PM and 5:00 PM–10:00 PM). A day with no
          windows is closed.
        </p>
        {recurringPending ? (
          <div className="text-sm text-gray-500">Loading…</div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {WEEKDAYS.map((day) => (
              <WeeklyDayEditor
                key={day.value}
                dayValue={day.value}
                dayLabel={day.label}
                windows={windowsByDay[day.value] || []}
                onAdd={(dayValue, window) => addWindowMutation.mutate({ day: dayValue, window })}
                onRemove={(id) => removeWindowMutation.mutate(id)}
                isBusy={addWindowMutation.isPending}
              />
            ))}
          </div>
        )}
        {addWindowMutation.isError && (
          <p className="text-sm text-error mt-2">
            Failed to add window: {(addWindowMutation.error as { message?: string })?.message || 'Unknown error'}
          </p>
        )}
        {removeWindowMutation.isError && (
          <p className="text-sm text-error mt-2">
            Failed to remove window: {(removeWindowMutation.error as { message?: string })?.message || 'Unknown error'}
          </p>
        )}
      </div>

      <div>
        <h4 className="font-semibold text-sm mb-1">Date Overrides</h4>
        <p className="text-xs text-text-secondary mb-3">
          Set custom hours or mark a specific date fully closed (holidays, special days) — overrides the
          weekly pattern for just that date.
        </p>

        <OverrideForm
          isBusy={saveOverrideMutation.isPending}
          onSave={(date, isClosed, windows) => saveOverrideMutation.mutate({ date, isClosed, windows })}
        />
        {saveOverrideMutation.isError && (
          <p className="text-sm text-error mt-2">
            Failed to save override: {(saveOverrideMutation.error as { message?: string })?.message || 'Unknown error'}
          </p>
        )}

        <div className="space-y-2 mt-4">
          {overridesPending ? (
            <div className="text-sm text-gray-500">Loading…</div>
          ) : overrides.length === 0 ? (
            <p className="text-sm text-gray-400">No upcoming overrides.</p>
          ) : (
            overrides.map((o) => (
              <div key={o.id} className="flex items-center justify-between border border-gray-200 rounded-lg p-3">
                <div>
                  <span className="font-medium text-sm">{format(parseISO(o.override_date), 'MMM d, yyyy')}</span>
                  {o.is_closed ? (
                    <span className="text-xs text-error ml-2">Closed all day</span>
                  ) : (
                    <span className="text-xs text-gray-500 ml-2">
                      {o.windows.map((w: OverrideWindowRow) => formatWindow(w)).join(', ')}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeOverrideMutation.mutate({ id: o.id, date: o.override_date })}
                  className="text-xs font-medium text-gray-500 hover:text-error"
                >
                  Remove
                </button>
              </div>
            ))
          )}
        </div>
        {removeOverrideMutation.isError && (
          <p className="text-sm text-error mt-2">
            Failed to remove override: {(removeOverrideMutation.error as { message?: string })?.message || 'Unknown error'}
          </p>
        )}
      </div>
    </div>
  )
}
