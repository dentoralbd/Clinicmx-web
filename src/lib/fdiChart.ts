// FDI helpers for the Anatomic Odontogram, ported from "v2 by AGY" (src/lib/fdi.ts).
// The age -> dentition decision itself is NOT redefined here — the chart is handed a
// `DentitionType` computed by the existing getDentitionTypeFromDOB()/getDentitionType()
// helpers (src/lib/ageTier.ts, PatientProfile.tsx), which already match AGY's thresholds
// (<5 deciduous / 5-14 mixed / >14 permanent).
import type { DentitionType } from '@/lib/ageTier'

const TOOTH_NAMES: Record<number, string> = {
  // Adult Maxilla (Q1 & Q2)
  18: 'Upper Right 3rd Molar (Wisdom)',
  17: 'Upper Right 2nd Molar',
  16: 'Upper Right 1st Molar',
  15: 'Upper Right 2nd Premolar',
  14: 'Upper Right 1st Premolar',
  13: 'Upper Right Canine',
  12: 'Upper Right Lateral Incisor',
  11: 'Upper Right Central Incisor',
  21: 'Upper Left Central Incisor',
  22: 'Upper Left Lateral Incisor',
  23: 'Upper Left Canine',
  24: 'Upper Left 1st Premolar',
  25: 'Upper Left 2nd Premolar',
  26: 'Upper Left 1st Molar',
  27: 'Upper Left 2nd Molar',
  28: 'Upper Left 3rd Molar (Wisdom)',

  // Adult Mandible (Q4 & Q3)
  48: 'Lower Right 3rd Molar (Wisdom)',
  47: 'Lower Right 2nd Molar',
  46: 'Lower Right 1st Molar',
  45: 'Lower Right 2nd Premolar',
  44: 'Lower Right 1st Premolar',
  43: 'Lower Right Canine',
  42: 'Lower Right Lateral Incisor',
  41: 'Lower Right Central Incisor',
  31: 'Lower Left Central Incisor',
  32: 'Lower Left Lateral Incisor',
  33: 'Lower Left Canine',
  34: 'Lower Left 1st Premolar',
  35: 'Lower Left 2nd Premolar',
  36: 'Lower Left 1st Molar',
  37: 'Lower Left 2nd Molar',
  38: 'Lower Left 3rd Molar (Wisdom)',

  // Primary Maxilla (Q5 & Q6)
  55: 'Upper Right 2nd Primary Molar',
  54: 'Upper Right 1st Primary Molar',
  53: 'Upper Right Primary Canine',
  52: 'Upper Right Primary Lateral Incisor',
  51: 'Upper Right Primary Central Incisor',
  61: 'Upper Left Primary Central Incisor',
  62: 'Upper Left Primary Lateral Incisor',
  63: 'Upper Left Primary Canine',
  64: 'Upper Left 1st Primary Molar',
  65: 'Upper Left 2nd Primary Molar',

  // Primary Mandible (Q8 & Q7)
  85: 'Lower Right 2nd Primary Molar',
  84: 'Lower Right 1st Primary Molar',
  83: 'Lower Right Primary Canine',
  82: 'Lower Right Primary Lateral Incisor',
  81: 'Lower Right Primary Central Incisor',
  71: 'Lower Left Primary Central Incisor',
  72: 'Lower Left Primary Lateral Incisor',
  73: 'Lower Left Primary Canine',
  74: 'Lower Left 1st Primary Molar',
  75: 'Lower Left 2nd Primary Molar',
}

const DENTITION_LABELS: Record<DentitionType, string> = {
  deciduous: 'Deciduous dentition (primary teeth)',
  mixed: 'Mixed dentition',
  permanent: 'Permanent dentition',
}

export function getDentitionLabel(ageYears: number | undefined | null, dentitionType: DentitionType): string {
  const ageStr = ageYears !== null && ageYears !== undefined && !isNaN(ageYears) ? `Age ${ageYears} · ` : ''
  return `${ageStr}${DENTITION_LABELS[dentitionType]}`
}

/**
 * Maps deciduous / primary teeth (FDI 51-85) to their anatomical permanent morphology counterpart.
 */
export function getEquivalentPermanentTooth(num: number): number {
  if (num < 51) return num
  const quadrant = Math.floor(num / 10)
  const position = num % 10
  // In primary dentition, 74 & 84 (mandibular 1st primary molars) have bifurcated 2-root
  // molar anatomy matching 75 & 85 (mapped to permanent molars 36 and 46).
  const permPos = position === 5 || num === 74 || num === 84 ? 6 : position === 4 ? 4 : position
  const permQuad = quadrant === 5 ? 1 : quadrant === 6 ? 2 : quadrant === 7 ? 3 : 4
  return permQuad * 10 + permPos
}

export function getFDIToothName(toothNumber: number): string {
  return TOOTH_NAMES[toothNumber] || `Tooth #${toothNumber}`
}
