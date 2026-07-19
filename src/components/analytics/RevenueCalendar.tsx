import { useMemo, useState } from 'react'
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from 'date-fns'
import { useNavigate } from 'react-router-dom'
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { formatBDT } from '@/lib/utils'
import {
  dailyCollected,
  dayKey,
  paymentsByPatient,
  type AnalyticsInvoice,
  type AnalyticsPatient,
  type AnalyticsPayment,
} from '@/lib/analytics'
import { ChartCard } from './ChartCard'

interface RevenueCalendarProps {
  payments: AnalyticsPayment[]
  invoices: AnalyticsInvoice[]
  patients: AnalyticsPatient[]
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

const dayAmountFormatter = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })

export function RevenueCalendar({ payments, invoices, patients }: RevenueCalendarProps) {
  const navigate = useNavigate()
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()))
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const activeInvoiceIds = useMemo(() => new Set(invoices.map((inv) => inv.id)), [invoices])
  const byDay = useMemo(() => dailyCollected(payments, activeInvoiceIds), [payments, activeInvoiceIds])

  // Full weeks covering the visible month, so the grid always starts on a Sunday.
  const gridDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(cursor), { weekStartsOn: 0 })
    const end = endOfWeek(endOfMonth(cursor), { weekStartsOn: 0 })
    const days: Date[] = []
    for (let d = start; d <= end; d = addDays(d, 1)) days.push(d)
    return days
  }, [cursor])

  const monthTotal = useMemo(
    () =>
      gridDays.reduce(
        (sum, day) => (isSameMonth(day, cursor) ? sum + (byDay.get(format(day, 'yyyy-MM-dd')) || 0) : sum),
        0
      ),
    [gridDays, cursor, byDay]
  )

  const selectedPayments = useMemo(
    () =>
      selectedDay
        ? payments.filter((p) => activeInvoiceIds.has(p.invoice_id) && dayKey(p.payment_date) === selectedDay)
        : [],
    [selectedDay, payments, activeInvoiceIds]
  )
  const selectedBreakdown = useMemo(
    () => (selectedDay ? paymentsByPatient(selectedPayments, invoices, patients) : []),
    [selectedDay, selectedPayments, invoices, patients]
  )
  const selectedTotal = selectedDay ? byDay.get(selectedDay) || 0 : 0

  return (
    <>
      <ChartCard
        icon={<CalendarDays className="w-4 h-4" />}
        title="Daily Earnings"
        caption="Payments received on each day (BDT). Tap a day to see which patients paid."
      >
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCursor((c) => addMonths(c, -1))}
              className="p-1.5 rounded-lg text-text-secondary hover:text-primary hover:bg-primary/5 transition-colors"
              aria-label="Previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-display font-semibold text-sm w-28 text-center">{format(cursor, 'MMMM yyyy')}</span>
            <button
              onClick={() => setCursor((c) => addMonths(c, 1))}
              className="p-1.5 rounded-lg text-text-secondary hover:text-primary hover:bg-primary/5 transition-colors"
              aria-label="Next month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-medium uppercase tracking-wide text-text-secondary">Month total</p>
            <p className="font-semibold tabular-nums">{formatBDT(monthTotal)}</p>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map((label) => (
            <div key={label} className="text-center text-[10px] font-medium uppercase tracking-wide text-text-secondary py-1">
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1">
          {gridDays.map((day) => {
            const key = format(day, 'yyyy-MM-dd')
            const amount = byDay.get(key) || 0
            const inMonth = isSameMonth(day, cursor)
            const clickable = inMonth && amount > 0
            return (
              <button
                key={key}
                onClick={() => clickable && setSelectedDay(key)}
                disabled={!clickable}
                className={`min-h-[52px] sm:min-h-[64px] rounded-lg border px-0.5 py-1 sm:px-1 flex flex-col items-center justify-start gap-0.5 transition-colors ${
                  inMonth ? 'border-gray-200/80' : 'border-transparent'
                } ${
                  clickable ? 'hover:border-primary hover:bg-primary/5 cursor-pointer' : 'cursor-default'
                } ${isToday(day) && inMonth ? 'ring-1 ring-primary ring-offset-0' : ''}`}
              >
                <span
                  className={`text-[11px] leading-none pt-0.5 ${
                    inMonth ? 'text-text-secondary' : 'text-gray-300'
                  } ${isToday(day) && inMonth ? 'font-bold text-primary' : ''}`}
                >
                  {format(day, 'd')}
                </span>
                {inMonth && amount > 0 && (
                  <span className="text-[10px] sm:text-[11px] font-semibold text-primary tabular-nums leading-tight break-all">
                    {dayAmountFormatter.format(amount)}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </ChartCard>

      {selectedDay && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedDay(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-gray-200 sticky top-0 bg-white flex items-start justify-between gap-4">
              <div>
                <h2 className="font-display text-xl font-bold">
                  {format(new Date(`${selectedDay}T00:00:00`), 'd MMM yyyy')}
                </h2>
                <p className="text-text-secondary text-sm mt-0.5">
                  {formatBDT(selectedTotal)} collected · {selectedPayments.length}{' '}
                  {selectedPayments.length === 1 ? 'payment' : 'payments'}
                </p>
              </div>
              <button
                onClick={() => setSelectedDay(null)}
                className="p-1.5 hover:bg-gray-100 rounded-lg flex-shrink-0"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6">
              {selectedBreakdown.length === 0 ? (
                <p className="text-sm text-text-secondary text-center py-6">No patient breakdown for this day.</p>
              ) : (
                <table className="w-full text-sm">
                  <tbody>
                    {selectedBreakdown.map((row) => (
                      <tr key={row.patientId || 'unknown'} className="border-b border-gray-50 last:border-0">
                        <td className="py-2.5 pr-3">
                          {row.patientId ? (
                            <button
                              onClick={() => navigate(`/patients/${row.patientId}`)}
                              className="font-medium text-left hover:text-primary hover:underline transition-colors"
                            >
                              {row.name}
                            </button>
                          ) : (
                            <span className="font-medium">{row.name}</span>
                          )}
                          {row.paymentCount > 1 && (
                            <span className="text-text-secondary text-xs ml-1.5">×{row.paymentCount}</span>
                          )}
                        </td>
                        <td className="py-2.5 text-right font-medium tabular-nums whitespace-nowrap">
                          {formatBDT(row.collected)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
