import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Clock } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { loadAppointmentSettings, saveAppointmentSettings } from '@/lib/appointmentSettings'
import { DEFAULT_APPOINTMENT_SETTINGS } from '@/lib/appointmentSlots'

const DAY_LABELS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
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

export function ClinicHoursTab() {
  const queryClient = useQueryClient()
  const { data: settings, isPending } = useQuery({
    queryKey: ['appointment_settings'],
    queryFn: loadAppointmentSettings,
  })

  const [startHour, setStartHour] = useState(DEFAULT_APPOINTMENT_SETTINGS.start_hour)
  const [startMinute, setStartMinute] = useState(DEFAULT_APPOINTMENT_SETTINGS.start_minute)
  const [endHour, setEndHour] = useState(DEFAULT_APPOINTMENT_SETTINGS.end_hour)
  const [endMinute, setEndMinute] = useState(DEFAULT_APPOINTMENT_SETTINGS.end_minute)
  const [openDays, setOpenDays] = useState<number[]>(DEFAULT_APPOINTMENT_SETTINGS.open_days)
  const [formError, setFormError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!settings) return
    setStartHour(settings.start_hour)
    setStartMinute(settings.start_minute)
    setEndHour(settings.end_hour)
    setEndMinute(settings.end_minute)
    setOpenDays(settings.open_days)
  }, [settings])

  const saveMutation = useMutation({
    mutationFn: () =>
      saveAppointmentSettings({ start_hour: startHour, start_minute: startMinute, end_hour: endHour, end_minute: endMinute, open_days: openDays }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['appointment_settings'] })
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    },
  })

  function toggleDay(day: number) {
    setOpenDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort()))
  }

  function handleSave() {
    setFormError('')
    const startMinutes = startHour * 60 + startMinute
    const endMinutes = endHour * 60 + endMinute
    if (endMinutes <= startMinutes) {
      setFormError('End time must be after start time.')
      return
    }
    saveMutation.mutate()
  }

  if (isPending) {
    return <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 text-sm text-gray-500">Loading…</div>
  }

  return (
    <div className="bg-white rounded-3xl border border-gray-200 shadow-sm p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
          <Clock className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h3 className="font-display text-lg font-bold">Clinic Hours</h3>
          <p className="text-sm text-text-secondary">
            Controls which appointment time slots staff can book — appointments already booked outside
            this window are not affected.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Opens at</label>
          <select
            value={timeValue(startHour, startMinute)}
            onChange={(e) => {
              const opt = TIME_OPTIONS.find((o) => o.value === e.target.value)
              if (opt) {
                setStartHour(opt.hour)
                setStartMinute(opt.minute)
              }
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {TIME_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Closes at</label>
          <select
            value={timeValue(endHour, endMinute)}
            onChange={(e) => {
              const opt = TIME_OPTIONS.find((o) => o.value === e.target.value)
              if (opt) {
                setEndHour(opt.hour)
                setEndMinute(opt.minute)
              }
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
          >
            {TIME_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Open days</label>
        <div className="flex gap-2 flex-wrap">
          {DAY_LABELS.map((day) => (
            <button
              key={day.value}
              type="button"
              onClick={() => toggleDay(day.value)}
              className={`min-w-[44px] min-h-[44px] px-3 py-2 rounded-lg font-medium transition ${
                openDays.includes(day.value)
                  ? 'bg-primary text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {day.label}
            </button>
          ))}
        </div>
      </div>

      <p className="text-sm text-gray-500">Appointment slots are 30 minutes each.</p>

      {formError && <p className="text-sm text-error">{formError}</p>}
      {saveMutation.isError && (
        <p className="text-sm text-error">
          Failed to save clinic hours: {(saveMutation.error as { message?: string })?.message || 'Unknown error'}
        </p>
      )}

      <div className="flex items-center gap-3">
        <Button type="button" onClick={handleSave} disabled={saveMutation.isPending}>
          {saveMutation.isPending ? 'Saving…' : 'Save Clinic Hours'}
        </Button>
        {saved && <span className="text-sm text-primary">Saved.</span>}
      </div>
    </div>
  )
}
