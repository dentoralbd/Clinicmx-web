// Shared model for repeatable clinical text entries (Chief Complaint, On Examination,
// Clinical Diagnosis, Treatment Plan) that can each be tagged with one or more FDI tooth numbers.
export interface ClinicalEntry {
  id: string
  text: string
  teeth: number[]
}

function newEntryId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `entry-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function createEmptyEntry(): ClinicalEntry {
  return { id: newEntryId(), text: '', teeth: [] }
}

// Flattens entries into the legacy plain-text column so old code paths
// (print fallback, dashboards, exports) that only read the string keep working.
export function entriesToText(entries: ClinicalEntry[]): string {
  return entries
    .filter((entry) => entry.text.trim())
    .map((entry) => {
      const text = entry.text.trim()
      return entry.teeth.length > 0 ? `${text} (Teeth: ${entry.teeth.join(', ')})` : text
    })
    .join('\n')
}

// Fallback parser for legacy single-string records saved before multi-entry support existed.
// Recovers a trailing "-NN" style tooth suffix (the old Treatment Plan convention) when present.
export function textToEntries(text: string | null | undefined): ClinicalEntry[] {
  if (!text || !text.trim()) return [createEmptyEntry()]
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const teethTagMatch = line.match(/\(Teeth:\s*([\d,\s]+)\)\s*$/i)
      if (teethTagMatch) {
        const teeth = teethTagMatch[1]
          .split(',')
          .map((n) => parseInt(n.trim(), 10))
          .filter((n) => !Number.isNaN(n))
        return { id: newEntryId(), text: line.slice(0, teethTagMatch.index).trim(), teeth }
      }
      const suffixMatch = line.match(/-\s*(\d{2})\s*$/)
      if (suffixMatch) {
        return { id: newEntryId(), text: line, teeth: [parseInt(suffixMatch[1], 10)] }
      }
      return { id: newEntryId(), text: line, teeth: [] }
    })
}
