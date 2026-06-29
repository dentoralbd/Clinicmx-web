import type { WeightDoseEstimate } from '@/lib/weightDosing'

export interface VolumeDoseEstimate {
  mlPerDoseMin?: number
  mlPerDoseMax?: number
  mlPerDayMin: number
  mlPerDayMax: number
}

export function isLiquidDosageForm(dosageForm: string): boolean {
  return /Syrup|Suspension|Pediatric Drop/i.test(dosageForm)
}

export function isSpoonableDosageForm(dosageForm: string): boolean {
  return /Syrup|Suspension/i.test(dosageForm)
}

/**
 * Extracts mg-per-ml from a dosageForm string like "120mg/5ml Syrup",
 * "125mg/31.25mg/5ml Suspension" (combo — uses the first/primary component),
 * or "80mg/ml Pediatric Drop" (volume defaults to 1ml when no number precedes "ml").
 */
export function parseLiquidConcentration(dosageForm: string): { mgPerMl: number } | null {
  const match = dosageForm.match(/^([\d.]+)mg\/(?:[\d.]+mg\/)?([\d.]*)ml/i)
  if (!match) return null

  const mg = Number.parseFloat(match[1])
  const ml = match[2] ? Number.parseFloat(match[2]) : 1
  if (!mg || !ml) return null

  return { mgPerMl: mg / ml }
}

export function calculateVolumeDose(estimate: WeightDoseEstimate, mgPerMl: number): VolumeDoseEstimate {
  return {
    mlPerDoseMin: estimate.perDoseMgMin != null ? estimate.perDoseMgMin / mgPerMl : undefined,
    mlPerDoseMax: estimate.perDoseMgMax != null ? estimate.perDoseMgMax / mgPerMl : undefined,
    mlPerDayMin: estimate.dailyMgMin / mgPerMl,
    mlPerDayMax: estimate.dailyMgMax / mgPerMl,
  }
}

function formatMlRange(min: number, max: number): string {
  const round = (n: number) => (Math.round(n * 10) / 10).toString()
  return min === max ? `${round(min)}ml` : `${round(min)}-${round(max)}ml`
}

export function formatVolumeDoseSuggestion(
  volume: VolumeDoseEstimate,
  dosesPerDay: number | undefined,
  isSpoonable: boolean,
): string {
  const parts: string[] = []

  if (volume.mlPerDoseMin != null && volume.mlPerDoseMax != null && dosesPerDay) {
    parts.push(`≈ ${formatMlRange(volume.mlPerDoseMin, volume.mlPerDoseMax)} per dose`)
    if (isSpoonable) {
      const spoonsMin = Math.round((volume.mlPerDoseMin / 5) * 10) / 10
      const spoonsMax = Math.round((volume.mlPerDoseMax / 5) * 10) / 10
      const spoons = spoonsMin === spoonsMax ? `${spoonsMin}` : `${spoonsMin}-${spoonsMax}`
      parts.push(`(≈ ${spoons} spoon${spoonsMax === 1 ? '' : 's'} of 5ml)`)
    }
  } else {
    parts.push(`≈ ${formatMlRange(volume.mlPerDayMin, volume.mlPerDayMax)}/day`)
  }

  return parts.join(' ')
}
