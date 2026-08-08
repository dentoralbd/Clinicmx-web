import { format } from 'date-fns'

// Shared by Delete History / Edit History (DoctorProfile.tsx) and the admin
// Offline Edits log (OfflineEditsTab.tsx) — every "show me the full record"
// panel in the app renders a payload/snapshot the same way.

function humanizeKey(key: string) {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/

function isIdKey(key: string) {
  return key === 'id' || key.endsWith('_id')
}

function formatSnapshotScalar(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'boolean') return value ? 'Yes' : 'No'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string') {
    if (ISO_DATE_RE.test(value)) {
      const date = new Date(value)
      if (!Number.isNaN(date.getTime())) {
        return value.includes('T') ? format(date, 'MMM d, yyyy h:mm a') : format(date, 'MMM d, yyyy')
      }
    }
    return value
  }
  return null
}

function summarizeSnapshotItem(item: unknown): string {
  if (item === null || item === undefined) return ''
  if (typeof item !== 'object') return formatSnapshotScalar(item) ?? ''
  const parts: string[] = []
  for (const [key, value] of Object.entries(item as Record<string, unknown>)) {
    if (isIdKey(key)) continue
    if (Array.isArray(value)) {
      const joined = value.map((v) => formatSnapshotScalar(v)).filter(Boolean).join(', ')
      if (joined) parts.push(joined)
      continue
    }
    const formatted = formatSnapshotScalar(value)
    if (formatted) parts.push(formatted)
  }
  return parts.join(' — ')
}

export function SnapshotDetails({ payload }: { payload: unknown }) {
  if (!payload || typeof payload !== 'object') {
    return <p className="text-xs text-gray-400">No details recorded.</p>
  }

  const entries = Object.entries(payload as Record<string, unknown>)
  const idEntries = entries.filter(([key]) => isIdKey(key))
  const detailEntries = entries.filter(([key]) => !isIdKey(key))

  return (
    <div className="space-y-1.5">
      {detailEntries.map(([key, value]) => {
        let rendered: React.ReactNode = null
        if (Array.isArray(value)) {
          const lines = value.map(summarizeSnapshotItem).filter(Boolean)
          if (lines.length === 0) return null
          rendered = (
            <span className="space-y-0.5">
              {lines.map((line, idx) => (
                <span key={idx} className="block">{lines.length > 1 ? `${idx + 1}. ` : ''}{line}</span>
              ))}
            </span>
          )
        } else if (value !== null && typeof value === 'object') {
          const summary = summarizeSnapshotItem(value)
          if (!summary) return null
          rendered = summary
        } else {
          const formatted = formatSnapshotScalar(value)
          if (formatted === null) return null
          rendered = <span className="whitespace-pre-line">{formatted}</span>
        }
        return (
          <div key={key} className="flex gap-3 text-xs">
            <span className="w-36 flex-shrink-0 font-medium text-gray-500">{humanizeKey(key)}</span>
            <span className="text-gray-800 min-w-0 flex-1">{rendered}</span>
          </div>
        )
      })}
      {idEntries.length > 0 && (
        <p className="pt-2 mt-2 border-t border-gray-200 text-[10px] text-gray-400 break-all">
          {idEntries.map(([key, value]) => `${humanizeKey(key)}: ${String(value)}`).join(' · ')}
        </p>
      )}
    </div>
  )
}
