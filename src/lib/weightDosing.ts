import type { WeightDoseFormula } from '@/lib/weightDosingFormulas'

export interface WeightDoseEstimate {
  dailyMgMin: number
  dailyMgMax: number
  perDoseMgMin?: number
  perDoseMgMax?: number
  dosesPerDay?: number
  exceedsMaxPerDose: boolean
  exceedsMaxPerDay: boolean
  sourceText: string
}

export function calculateWeightDose(formula: WeightDoseFormula, weightKg: number): WeightDoseEstimate | null {
  if (!weightKg || weightKg <= 0) return null

  const mgPerKgMax = formula.mgPerKgMax ?? formula.mgPerKgMin

  let dailyMgMin: number
  let dailyMgMax: number
  let perDoseMgMin: number | undefined
  let perDoseMgMax: number | undefined

  if (formula.basis === 'perDay') {
    dailyMgMin = formula.mgPerKgMin * weightKg
    dailyMgMax = mgPerKgMax * weightKg
    perDoseMgMin = formula.dosesPerDay ? dailyMgMin / formula.dosesPerDay : undefined
    perDoseMgMax = formula.dosesPerDay ? dailyMgMax / formula.dosesPerDay : undefined
  } else {
    perDoseMgMin = formula.mgPerKgMin * weightKg
    perDoseMgMax = mgPerKgMax * weightKg
    dailyMgMin = formula.dosesPerDay ? perDoseMgMin * formula.dosesPerDay : perDoseMgMin
    dailyMgMax = formula.dosesPerDay ? perDoseMgMax * formula.dosesPerDay : perDoseMgMax
  }

  return {
    dailyMgMin,
    dailyMgMax,
    perDoseMgMin,
    perDoseMgMax,
    dosesPerDay: formula.dosesPerDay,
    exceedsMaxPerDose: formula.maxMgPerDose != null && (perDoseMgMax ?? dailyMgMax) > formula.maxMgPerDose,
    exceedsMaxPerDay: formula.maxMgPerDay != null && dailyMgMax > formula.maxMgPerDay,
    sourceText: formula.sourceText,
  }
}

function formatMgRange(min: number, max: number): string {
  const round = (n: number) => (Math.round(n * 10) / 10).toString()
  return min === max ? `${round(min)}mg` : `${round(min)}-${round(max)}mg`
}

export function formatWeightDoseSuggestion(estimate: WeightDoseEstimate): string {
  const parts: string[] = []

  if (estimate.perDoseMgMin != null && estimate.perDoseMgMax != null && estimate.dosesPerDay) {
    parts.push(`~${formatMgRange(estimate.perDoseMgMin, estimate.perDoseMgMax)} per dose, ${estimate.dosesPerDay}x daily`)
    parts.push(`(~${formatMgRange(estimate.dailyMgMin, estimate.dailyMgMax)}/day)`)
  } else {
    parts.push(`~${formatMgRange(estimate.dailyMgMin, estimate.dailyMgMax)}/day`)
  }

  if (estimate.exceedsMaxPerDose) parts.push('(exceeds typical max per dose — verify)')
  if (estimate.exceedsMaxPerDay) parts.push('(exceeds typical max per day — verify)')

  return parts.join(' ')
}
