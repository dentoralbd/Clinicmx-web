// Types for the Anatomic Odontogram (ported from "v2 by AGY"). Surfaces are intentionally
// kept optional and unused in ClinicMx (the per-surface M/O/D/B/L marking was descoped), but
// the field is retained so the ported components typecheck without edits to their history log.

export type ToothCondition =
  | 'healthy'
  | 'decayed'
  | 'filled'
  | 'missing'
  | 'root_canal'
  | 'crown'
  | 'bridge'
  | 'implant'
  | 'extracted'
  | 'impacted'

export type ToothSurface = 'M' | 'O' | 'D' | 'B' | 'L'

/** Live/current state of a single tooth (one per tooth number). */
export interface DentalChartEntry {
  toothNumber: number // FDI: 11-48 permanent; 51-85 primary
  condition: ToothCondition
  surfaces: ToothSurface[]
  notes?: string
  updatedAt: string
  procedureDate?: string // YYYY-MM-DD
  treatmentId?: string
}

/** Append-only dated history record — one row per save, powering the timeline. */
export interface DentalChartHistoryEntry {
  id: string
  patientId: string
  toothNumber: number
  condition: ToothCondition
  surfaces: ToothSurface[]
  notes?: string
  procedureDate: string // YYYY-MM-DD
  createdAt: string // ISO timestamp
  treatmentId?: string
  doctorName?: string
}
