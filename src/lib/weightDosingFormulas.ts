export interface WeightDoseFormula {
  /** Whether mgPerKgMin/Max represents a single dose, or the full day's total. */
  basis: 'perDose' | 'perDay'
  mgPerKgMin: number
  mgPerKgMax?: number
  /** Only set when the source text states an unambiguous, single dose count (e.g. "divided 3x", "every 8h", "twice daily"). */
  dosesPerDay?: number
  maxMgPerDose?: number
  maxMgPerDay?: number
  /** The exact ageDosing string in dentalDrugDatabase.ts this was transcribed from, for traceability. */
  sourceText: string
}

/**
 * Keyed by BDDrug['generic']. Only generics whose existing ageDosing.child/infant text
 * states an explicit, unambiguous per-kg figure get an entry here. Entries are
 * deliberately absent (not given a "not applicable" flag) for drugs that are warnings,
 * alternative-drug suggestions, non-weight-based topical/local/volume guidance, or whose
 * source text is ambiguous about dose count or frequency (e.g. "divided 2-3x", "every 6-8h")
 * — absence is the signal that no AI estimate is available for that drug/tier. Lidocaine is
 * excluded entirely: its numbers are a maximum-safe-dose ceiling for an anesthetic injection,
 * not a recommended therapeutic dose, and doesn't fit the "suggested dosage" framing safely.
 *
 * Curated from dentalDrugDatabase.ts ageDosing text as of this feature's implementation —
 * review against that source text before relying on this for real patients.
 */
export const WEIGHT_DOSING_FORMULAS: Record<string, Partial<Record<'infant' | 'child', WeightDoseFormula>>> = {
  'Amoxicillin Trihydrate': {
    child: { basis: 'perDay', mgPerKgMin: 25, dosesPerDay: 3, maxMgPerDose: 500, sourceText: '25mg/kg/day divided 3x (max 500mg/dose)' },
    infant: { basis: 'perDay', mgPerKgMin: 20, mgPerKgMax: 40, dosesPerDay: 3, sourceText: '20-40mg/kg/day divided 3x (suspension)' },
  },
  'Amoxicillin + Clavulanic Acid': {
    child: { basis: 'perDay', mgPerKgMin: 25, mgPerKgMax: 45, dosesPerDay: 2, sourceText: '25-45mg/kg/day divided 2x' },
  },
  Metronidazole: {
    child: { basis: 'perDose', mgPerKgMin: 7.5, dosesPerDay: 3, sourceText: '7.5mg/kg 3x daily' },
    infant: { basis: 'perDose', mgPerKgMin: 7.5, dosesPerDay: 3, sourceText: '7.5mg/kg every 8h (avoid <2 months unless essential)' },
  },
  Azithromycin: {
    child: { basis: 'perDose', mgPerKgMin: 10, dosesPerDay: 1, sourceText: '10mg/kg once daily' },
  },
  'Diclofenac Sodium': {
    child: { basis: 'perDay', mgPerKgMin: 1, mgPerKgMax: 3, sourceText: '1-3mg/kg/day divided (>1 year, caution)' },
  },
  Paracetamol: {
    child: { basis: 'perDose', mgPerKgMin: 10, mgPerKgMax: 15, sourceText: '10-15mg/kg every 4-6h (max 4 doses/day)' },
    infant: { basis: 'perDose', mgPerKgMin: 10, mgPerKgMax: 15, sourceText: '10-15mg/kg every 4-6h' },
  },
  Dexamethasone: {
    child: { basis: 'perDose', mgPerKgMin: 0.1, mgPerKgMax: 0.2, dosesPerDay: 1, sourceText: '0.1-0.2mg/kg single dose (caution)' },
  },
  'Clindamycin HCl': {
    child: { basis: 'perDay', mgPerKgMin: 10, mgPerKgMax: 25, dosesPerDay: 3, sourceText: '10-25mg/kg/day divided 3x' },
    infant: { basis: 'perDay', mgPerKgMin: 10, mgPerKgMax: 25, sourceText: 'Not first-line; 10-25mg/kg/day divided if needed' },
  },
  Cefixime: {
    child: { basis: 'perDay', mgPerKgMin: 8, sourceText: '8mg/kg/day once or divided 2x' },
    infant: { basis: 'perDay', mgPerKgMin: 8, sourceText: '8mg/kg/day divided (suspension)' },
  },
  'Mefenamic Acid': {
    child: { basis: 'perDose', mgPerKgMin: 6.5, dosesPerDay: 3, sourceText: '6.5mg/kg every 8h (>6 months)' },
  },
  'Tranexamic Acid': {
    child: { basis: 'perDose', mgPerKgMin: 10, dosesPerDay: 3, sourceText: '10mg/kg every 8h' },
    infant: { basis: 'perDose', mgPerKgMin: 10, dosesPerDay: 3, sourceText: '10mg/kg every 8h (specialist use)' },
  },
  Cephalexin: {
    child: { basis: 'perDay', mgPerKgMin: 25, mgPerKgMax: 50, dosesPerDay: 4, maxMgPerDose: 500, sourceText: '25-50mg/kg/day divided 4x (max 500mg/dose)' },
    infant: { basis: 'perDay', mgPerKgMin: 25, mgPerKgMax: 50, dosesPerDay: 4, sourceText: '25-50mg/kg/day divided 4x' },
  },
  Cephradine: {
    child: { basis: 'perDay', mgPerKgMin: 25, mgPerKgMax: 50, dosesPerDay: 4, maxMgPerDose: 500, sourceText: '25-50mg/kg/day divided 4x (max 500mg/dose)' },
    infant: { basis: 'perDay', mgPerKgMin: 25, mgPerKgMax: 50, dosesPerDay: 4, sourceText: '25-50mg/kg/day divided 4x' },
  },
  'Cefuroxime Axetil': {
    child: { basis: 'perDose', mgPerKgMin: 10, mgPerKgMax: 15, dosesPerDay: 2, maxMgPerDose: 250, sourceText: '10-15mg/kg twice daily (max 250mg/dose)' },
  },
  Ceftriaxone: {
    child: { basis: 'perDose', mgPerKgMin: 50, mgPerKgMax: 75, dosesPerDay: 1, sourceText: '50-75mg/kg once daily' },
    infant: { basis: 'perDose', mgPerKgMin: 20, mgPerKgMax: 50, dosesPerDay: 1, sourceText: '20-50mg/kg once daily IV/IM' },
  },
  Cefepime: {
    child: { basis: 'perDose', mgPerKgMin: 50, dosesPerDay: 2, sourceText: '50mg/kg every 12h' },
    infant: { basis: 'perDose', mgPerKgMin: 50, dosesPerDay: 2, sourceText: '50mg/kg every 12h (specialist/hospital use)' },
  },
  'Cefixime + Clavulanic Acid': {
    child: { basis: 'perDay', mgPerKgMin: 8, dosesPerDay: 2, sourceText: '8mg/kg/day (cefixime component) divided 2x' },
  },
  'Cefuroxime + Clavulanic Acid': {
    child: { basis: 'perDose', mgPerKgMin: 10, mgPerKgMax: 15, dosesPerDay: 2, sourceText: '10-15mg/kg (cefuroxime component) twice daily' },
  },
  Acyclovir: {
    child: { basis: 'perDose', mgPerKgMin: 20, dosesPerDay: 4, maxMgPerDose: 800, sourceText: '20mg/kg every 6h (max 800mg/dose)' },
    infant: { basis: 'perDose', mgPerKgMin: 10, dosesPerDay: 3, sourceText: '10mg/kg every 8h (severe HSV, specialist use)' },
  },
  Valacyclovir: {
    child: { basis: 'perDose', mgPerKgMin: 20, dosesPerDay: 2, sourceText: '20mg/kg twice daily (>2 years, specialist guidance)' },
  },
  Fluconazole: {
    child: { basis: 'perDose', mgPerKgMin: 3, mgPerKgMax: 6, dosesPerDay: 1, maxMgPerDose: 150, sourceText: '3-6mg/kg once daily (max 150mg)' },
    infant: { basis: 'perDose', mgPerKgMin: 3, mgPerKgMax: 6, dosesPerDay: 1, sourceText: '3-6mg/kg once daily' },
  },
  'Phenoxymethylpenicillin (Penicillin V)': {
    infant: { basis: 'perDose', mgPerKgMin: 15, dosesPerDay: 4, sourceText: '15mg/kg every 6h (suspension)' },
  },
  Ampicillin: {
    child: { basis: 'perDay', mgPerKgMin: 25, mgPerKgMax: 50, dosesPerDay: 4, maxMgPerDose: 500, sourceText: '25-50mg/kg/day divided 4x (max 500mg/dose)' },
    infant: { basis: 'perDay', mgPerKgMin: 25, mgPerKgMax: 50, dosesPerDay: 4, sourceText: '25-50mg/kg/day divided 4x' },
  },
  Cloxacillin: {
    child: { basis: 'perDay', mgPerKgMin: 25, mgPerKgMax: 50, dosesPerDay: 4, sourceText: '25-50mg/kg/day divided 4x' },
    infant: { basis: 'perDay', mgPerKgMin: 25, mgPerKgMax: 50, dosesPerDay: 4, sourceText: '25-50mg/kg/day divided 4x' },
  },
}
