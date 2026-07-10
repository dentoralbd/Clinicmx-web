import { useState } from 'react'
import { format } from 'date-fns'
import { Activity, Calendar, DollarSign, FolderOpen, Pill, Stethoscope } from 'lucide-react'

export interface TimelineItem {
  id: string
  type: 'visit' | 'treatment' | 'prescription' | 'invoice' | 'appointment' | 'file'
  date: string
  title: string
  subtitle?: string
  badge?: string
  amountLabel?: string
  sectionId: string
}

interface ActivityTimelineProps {
  items: TimelineItem[]
  onNavigate: (sectionId: string) => void
  initialCount?: number
}

const TYPE_META: Record<TimelineItem['type'], { icon: any; dot: string; iconColor: string }> = {
  visit: { icon: Stethoscope, dot: 'bg-sky-100', iconColor: 'text-sky-600' },
  treatment: { icon: Activity, dot: 'bg-emerald-100', iconColor: 'text-emerald-600' },
  prescription: { icon: Pill, dot: 'bg-violet-100', iconColor: 'text-violet-600' },
  invoice: { icon: DollarSign, dot: 'bg-amber-100', iconColor: 'text-amber-600' },
  appointment: { icon: Calendar, dot: 'bg-blue-100', iconColor: 'text-blue-600' },
  file: { icon: FolderOpen, dot: 'bg-gray-100', iconColor: 'text-gray-500' },
}

export function ActivityTimeline({ items, onNavigate, initialCount = 15 }: ActivityTimelineProps) {
  const [visibleCount, setVisibleCount] = useState(initialCount)

  const sorted = items
    .filter((item) => !Number.isNaN(new Date(item.date).getTime()))
    .sort((left, right) => new Date(right.date).getTime() - new Date(left.date).getTime())

  if (sorted.length === 0) {
    return <p className="rounded-2xl bg-gray-50 p-4 text-sm text-text-secondary">No activity recorded for this patient yet.</p>
  }

  const visible = sorted.slice(0, visibleCount)
  const groups: Array<{ day: string; items: TimelineItem[] }> = []
  for (const item of visible) {
    const day = format(new Date(item.date), 'MMMM d, yyyy')
    const lastGroup = groups[groups.length - 1]
    if (lastGroup && lastGroup.day === day) {
      lastGroup.items.push(item)
    } else {
      groups.push({ day, items: [item] })
    }
  }

  return (
    <div className="space-y-5">
      {groups.map((group) => (
        <div key={group.day}>
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">{group.day}</div>
          <div className="space-y-1 border-l-2 border-gray-200 pl-4">
            {group.items.map((item) => {
              const meta = TYPE_META[item.type]
              const Icon = meta.icon
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.sectionId)}
                  className="flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-gray-50"
                >
                  <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${meta.dot}`}>
                    <Icon className={`h-4 w-4 ${meta.iconColor}`} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block line-clamp-2 break-words text-sm font-medium">{item.title}</span>
                    {item.subtitle && <span className="block truncate text-xs text-text-secondary">{item.subtitle}</span>}
                  </span>
                  {item.badge && (
                    <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-text-secondary">
                      {item.badge}
                    </span>
                  )}
                  {item.amountLabel && <span className="shrink-0 text-sm font-semibold">{item.amountLabel}</span>}
                </button>
              )
            })}
          </div>
        </div>
      ))}

      {sorted.length > visibleCount && (
        <button
          onClick={() => setVisibleCount((count) => count + 15)}
          className="w-full rounded-2xl border border-gray-200 bg-white py-2 text-sm font-medium text-primary transition-colors hover:bg-gray-50"
        >
          Show more ({sorted.length - visibleCount} older)
        </button>
      )}
    </div>
  )
}
