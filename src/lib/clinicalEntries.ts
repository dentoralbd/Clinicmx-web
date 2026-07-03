// Shared model for repeatable clinical text entries (Chief Complaint, On Examination,
// Clinical Diagnosis, Treatment Plan) that can each be tagged with one or more FDI tooth numbers.
// Chief Complaint instead tags dental quadrants (coarser than a single tooth, since complaints
// are usually described by area — "upper right" — rather than an exact tooth).
export interface ClinicalEntry {
  id: string
  text: string
  teeth: number[]
  quadrants?: number[]
}

// Quadrant codes match the FDI quadrant convention already used by ToothSelector
// (Q1 upper right ... Q4 lower right).
export const QUADRANTS = [
  { code: 1, abbr: 'UR', label: 'Upper Right' },
  { code: 2, abbr: 'UL', label: 'Upper Left' },
  { code: 3, abbr: 'LL', label: 'Lower Left' },
  { code: 4, abbr: 'LR', label: 'Lower Right' },
] as const

export function quadrantAbbr(code: number): string {
  return QUADRANTS.find((q) => q.code === code)?.abbr ?? String(code)
}

function quadrantCodeFromAbbr(abbr: string): number | undefined {
  return QUADRANTS.find((q) => q.abbr === abbr)?.code
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
      if (entry.teeth.length > 0) return `${text} (Teeth: ${entry.teeth.join(', ')})`
      if (entry.quadrants && entry.quadrants.length > 0) {
        return `${text} (Quadrant: ${entry.quadrants.map(quadrantAbbr).join(', ')})`
      }
      return text
    })
    .join('\n')
}

// Valid FDI permanent tooth numbers: 11-18, 21-28, 31-38, 41-48.
const FDI_TEXT_RE = /\b([1-4][1-8])\b/g

// Union of teeth referenced across the given entry groups — both teeth tagged via the
// tooth selector and valid FDI numbers typed in the entry text (e.g. "Deep caries in 36").
// Used to suggest already-mentioned teeth in downstream fields (Diagnosis, Treatment Plan).
export function collectSuggestedTeeth(entryGroups: ClinicalEntry[][]): number[] {
  const teeth = new Set<number>()
  for (const entries of entryGroups) {
    for (const entry of entries) {
      for (const n of entry.teeth) teeth.add(n)
      for (const match of entry.text.matchAll(FDI_TEXT_RE)) {
        teeth.add(parseInt(match[1], 10))
      }
    }
  }
  return [...teeth].sort((a, b) => a - b)
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
      const quadrantTagMatch = line.match(/\(Quadrant:\s*([A-Za-z,\s]+)\)\s*$/i)
      if (quadrantTagMatch) {
        const quadrants = quadrantTagMatch[1]
          .split(',')
          .map((abbr) => quadrantCodeFromAbbr(abbr.trim().toUpperCase()))
          .filter((code): code is number => code !== undefined)
        return { id: newEntryId(), text: line.slice(0, quadrantTagMatch.index).trim(), teeth: [], quadrants }
      }
      const suffixMatch = line.match(/-\s*(\d{2})\s*$/)
      if (suffixMatch) {
        return { id: newEntryId(), text: line, teeth: [parseInt(suffixMatch[1], 10)] }
      }
      return { id: newEntryId(), text: line, teeth: [] }
    })
}
