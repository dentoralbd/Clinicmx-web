import React, { useState } from 'react'
import type { DentitionType } from '@/lib/ageTier'
import { DentalChartEntry, DentalChartHistoryEntry, ToothCondition } from '@/types/dentalChart'
import { getFDIToothName, getDentitionLabel } from '@/lib/fdiChart'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/Button'
import { ANATOMICAL_TEETH_32, AnatomicalToothDef } from './AnatomicalToothData'
import { AnatomicArch, getToothDef } from './AnatomicArch'
import { DentalChartTimeline } from './DentalChartTimeline'
import { ToothHistoryList } from './ToothHistoryList'
import { Sparkles, Layers, History, RotateCcw, Clock, X } from 'lucide-react'

export interface OngoingTreatment {
  treatmentType: string
  teeth?: number[]
  status: string
  totalSittings?: number
  completedSittings?: number
}

export interface AnatomicDentalChartProps {
  patientAge?: number | null
  /** Computed by ClinicMx's existing age->dentition helpers; the chart never derives it itself. */
  dentitionType: DentitionType
  entries: DentalChartEntry[]
  historyEntries?: DentalChartHistoryEntry[]
  ongoingTreatments?: OngoingTreatment[]
  onUpdateTooth: (entry: DentalChartEntry, procedureDate?: string) => void
  readOnly?: boolean
}

// Condition styling dictionary matching the KeyMo / ClinicMx v2 reference UI.
const CONDITION_STYLES: Record<
  ToothCondition,
  {
    label: string
    code: string
    rootFill: string
    crownFill: string
    stroke: string
    circleFill: string
    badgeBg: string
    badgeText: string
  }
> = {
  healthy: { label: 'Healthy Natural', code: 'HLT', rootFill: '#E2E8F0', crownFill: '#FFFFFF', stroke: '#94A3B8', circleFill: '#FFFFFF', badgeBg: 'bg-slate-100', badgeText: 'text-slate-700' },
  root_canal: { label: 'Root Canal (RCT)', code: 'RCT', rootFill: '#FDA4AF', crownFill: '#FFF1F2', stroke: '#E11D48', circleFill: '#FFE4E6', badgeBg: 'bg-rose-100', badgeText: 'text-rose-700' },
  filled: { label: 'Restored / Therapy', code: 'FIL', rootFill: '#C7D2FE', crownFill: '#EEF2FF', stroke: '#4F46E5', circleFill: '#E0E7FF', badgeBg: 'bg-indigo-100', badgeText: 'text-indigo-700' },
  crown: { label: 'Full Crown / Cap', code: 'CRW', rootFill: '#E2E8F0', crownFill: '#FEF08A', stroke: '#CA8A04', circleFill: '#FEF9C3', badgeBg: 'bg-yellow-100', badgeText: 'text-yellow-800' },
  decayed: { label: 'Caries / Decayed', code: 'CAR', rootFill: '#E2E8F0', crownFill: '#FED7AA', stroke: '#EA580C', circleFill: '#FFEDD5', badgeBg: 'bg-orange-100', badgeText: 'text-orange-700' },
  missing: { label: 'Missing Tooth', code: 'MIS', rootFill: '#F1F5F9', crownFill: '#F8FAFC', stroke: '#CBD5E1', circleFill: '#F1F5F9', badgeBg: 'bg-slate-50', badgeText: 'text-slate-500' },
  extracted: { label: 'Extracted', code: 'EXT', rootFill: '#64748B', crownFill: '#64748B', stroke: '#475569', circleFill: '#64748B', badgeBg: 'bg-slate-200', badgeText: 'text-slate-800' },
  implant: { label: 'Dental Implant', code: 'IMP', rootFill: '#99F6E4', crownFill: '#F0FDFA', stroke: '#0D9488', circleFill: '#CCFBF1', badgeBg: 'bg-teal-100', badgeText: 'text-teal-800' },
  bridge: { label: 'Bridge Abutment', code: 'BRG', rootFill: '#A7F3D0', crownFill: '#ECFDF5', stroke: '#059669', circleFill: '#D1FAE5', badgeBg: 'bg-emerald-100', badgeText: 'text-emerald-700' },
  impacted: { label: 'Impacted Tooth', code: 'IMP', rootFill: '#FED7AA', crownFill: '#FFF7ED', stroke: '#F97316', circleFill: '#FFEDD5', badgeBg: 'bg-amber-100', badgeText: 'text-amber-700' },
}

const PRIMARY_UPPER = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65]
const PRIMARY_LOWER = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75]

/**
 * Computes the state of each tooth as of a historical target date by replaying dated history
 * (last-write-per-tooth-wins). targetDate === null returns the live/current entries.
 */
function computeChartSnapshot(
  history: DentalChartHistoryEntry[],
  liveEntries: DentalChartEntry[],
  targetDate: string | null
): DentalChartEntry[] {
  if (!targetDate) return liveEntries

  const targetTimestamp = `${targetDate}T23:59:59.999Z`
  const relevant = history.filter((h) => {
    const d = h.procedureDate ? `${h.procedureDate}T23:59:59.999Z` : h.createdAt
    return d <= targetTimestamp
  })

  const toothMap = new Map<number, DentalChartEntry>()
  const sorted = [...relevant].sort((a, b) =>
    (a.procedureDate || a.createdAt).localeCompare(b.procedureDate || b.createdAt)
  )

  for (const h of sorted) {
    toothMap.set(h.toothNumber, {
      toothNumber: h.toothNumber,
      condition: h.condition,
      surfaces: h.surfaces,
      notes: h.notes,
      updatedAt: h.createdAt,
      procedureDate: h.procedureDate,
      treatmentId: h.treatmentId,
    })
  }

  return Array.from(toothMap.values())
}

export const AnatomicDentalChart: React.FC<AnatomicDentalChartProps> = ({
  patientAge,
  dentitionType,
  entries,
  historyEntries = [],
  ongoingTreatments = [],
  onUpdateTooth,
  readOnly = false,
}) => {
  const [viewPerspective, setViewPerspective] = useState<'panoramic' | 'arch'>('panoramic')
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null)
  const [condition, setCondition] = useState<ToothCondition>('healthy')
  const [notes, setNotes] = useState('')
  const [procedureDate, setProcedureDate] = useState<string>(new Date().toISOString().split('T')[0])
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedToothFilter, setSelectedToothFilter] = useState<number | null>(null)

  const isViewingHistorical = selectedDate !== null
  const activeEntries = computeChartSnapshot(historyEntries, entries, selectedDate)

  const getToothEntry = (toothNum: number) => activeEntries.find((e) => e.toothNumber === toothNum)

  const ageForLabel = patientAge ?? undefined
  const isMixed = dentitionType === 'mixed'
  const isDeciduousOnly = dentitionType === 'deciduous'

  const handleOpenTooth = (toothNum: number) => {
    setSelectedToothFilter(toothNum)
    if (readOnly || isViewingHistorical) return
    const current = getToothEntry(toothNum)
    setSelectedTooth(toothNum)
    setCondition(current?.condition || 'healthy')
    setNotes(current?.notes || '')
    setProcedureDate(current?.procedureDate || new Date().toISOString().split('T')[0])
  }

  const handleSaveTooth = () => {
    if (selectedTooth === null) return
    onUpdateTooth(
      {
        toothNumber: selectedTooth,
        condition,
        surfaces: [],
        notes,
        updatedAt: new Date().toISOString(),
        procedureDate,
      },
      procedureDate
    )
    setSelectedTooth(null)
  }

  const PRIMARY_SOLO_SLOT_X = [170, 222, 274, 326, 378, 442, 494, 546, 598, 650]
  const PRIMARY_MIXED_SLOTS_X = [194, 240, 284, 326, 368, 452, 494, 536, 580, 626]

  // Single-dentition mode tooth lists (Deciduous-only or Permanent-only)
  const upperTeeth = isDeciduousOnly
    ? PRIMARY_UPPER.map((num, i) => ({ ...getToothDef(num)!, slotX: PRIMARY_SOLO_SLOT_X[i] }))
    : ANATOMICAL_TEETH_32.filter((t) => t.arch === 'upper')

  const lowerTeeth = isDeciduousOnly
    ? PRIMARY_LOWER.map((num, i) => ({ ...getToothDef(num)!, slotX: PRIMARY_SOLO_SLOT_X[i] }))
    : ANATOMICAL_TEETH_32.filter((t) => t.arch === 'lower')

  // Mixed-dentition 4-tier coordinated tooth lists (Permanent + Primary together)
  const mixedUpperPermanent = ANATOMICAL_TEETH_32.filter((t) => t.arch === 'upper')
  const mixedUpperPrimary = PRIMARY_UPPER.map((num, i) => ({ ...getToothDef(num)!, slotX: PRIMARY_MIXED_SLOTS_X[i] }))
  const mixedLowerPrimary = PRIMARY_LOWER.map((num, i) => ({ ...getToothDef(num)!, slotX: PRIMARY_MIXED_SLOTS_X[i] }))
  const mixedLowerPermanent = ANATOMICAL_TEETH_32.filter((t) => t.arch === 'lower')

  /**
   * Whole-tooth condition status dot for the Panoramic layout (surfaces are descoped in
   * ClinicMx, so this replaces AGY's interactive 5-sector M/O/D/B/L circle).
   */
  const renderStatusDot = (toothNum: number, cx: number, cy: number, scale = 1) => {
    const entry = getToothEntry(toothNum)
    const cond = entry?.condition || 'healthy'
    const style = CONDITION_STYLES[cond]
    const isExtracted = cond === 'extracted'
    const isMissing = cond === 'missing'
    const isSelected = selectedTooth === toothNum
    const R = 11.5

    return (
      <g
        key={`dot-${toothNum}`}
        onClick={() => handleOpenTooth(toothNum)}
        className="cursor-pointer group select-none"
        transform={scale !== 1 ? `translate(${cx}, ${cy}) scale(${scale}) translate(${-cx}, ${-cy})` : undefined}
      >
        <title>{`Tooth #${toothNum} — ${CONDITION_STYLES[cond].label}`}</title>
        {isSelected && <circle cx={cx} cy={cy} r={R + 3} fill="none" stroke="#0284C7" strokeWidth="1.8" />}
        <circle
          cx={cx}
          cy={cy}
          r={R}
          fill={isExtracted ? '#64748B' : style.circleFill}
          stroke={isExtracted ? '#475569' : style.stroke}
          strokeWidth="1.1"
          strokeDasharray={isMissing ? '3 2' : undefined}
          opacity={isMissing ? 0.6 : 1}
          className="group-hover:opacity-85 transition-opacity"
        />
      </g>
    )
  }

  /** Renders the layered anatomical tooth body (roots + canal/implant + CEJ + crown). */
  const renderToothLayers = (tooth: AnatomicalToothDef, toothNum: number, isUpper: boolean, isSelected: boolean) => {
    const entry = getToothEntry(toothNum)
    const cond = entry?.condition || 'healthy'
    const style = CONDITION_STYLES[cond]
    const isExtracted = cond === 'extracted' // solid dark silhouette
    const isMissing = cond === 'missing' // faded ghost tooth (reads as "not present")
    const isImplant = cond === 'implant'
    const isRCT = cond === 'root_canal'
    const dash = isMissing ? '3 3' : undefined

    const body = (
      <>
        {tooth.secondaryRootPath && !isExtracted && (
          <path d={tooth.secondaryRootPath} fill={isRCT ? '#FECDD3' : isMissing ? '#F1F5F9' : '#CBD5E1'} stroke="#CBD5E1" strokeWidth="0.9" opacity={isMissing ? 0.6 : 0.75} />
        )}
        <path
          d={tooth.rootPath}
          fill={style.rootFill}
          stroke={isSelected ? '#0284C7' : style.stroke}
          strokeWidth={isSelected ? '2' : '1.1'}
          strokeLinejoin="round"
          strokeLinecap="round"
          strokeDasharray={dash}
          opacity={isExtracted ? 0.9 : 0.85}
        />
        {isRCT && (
          <line x1="0" y1={isUpper ? -50 : 50} x2="0" y2={isUpper ? -8 : 8} stroke="#E11D48" strokeWidth="2.6" strokeLinecap="round" />
        )}
        {isImplant && (
          <g>
            {[-36, -26, -16, 16, 26, 36].map((th) => (
              <line key={th} x1="-5" y1={th} x2="5" y2={th} stroke="#0F766E" strokeWidth="1.2" strokeLinecap="round" />
            ))}
          </g>
        )}
        {!isExtracted && (
          <path d={tooth.cervicalCurve} fill="none" stroke="#CBD5E1" strokeWidth="0.8" strokeLinecap="round" />
        )}
        <path
          d={tooth.crownPath}
          fill={style.crownFill}
          stroke={isSelected ? '#0284C7' : style.stroke}
          strokeWidth={isSelected ? '2.4' : '1.3'}
          strokeLinejoin="round"
          strokeDasharray={dash}
          className="filter drop-shadow-2xs group-hover:brightness-95 transition-all"
        />
      </>
    )

    // A missing tooth is drawn as a faint, dashed ghost so it recedes into the chart
    // background — visually distinct from the solid dark Extracted silhouette.
    return isMissing ? <g opacity={0.45}>{body}</g> : body
  }

  /** Panoramic straight-row anatomical tooth. */
  const renderPanoramicTooth = (tooth: AnatomicalToothDef, isUpper: boolean, customBaseY?: number, customScale = 1) => {
    const isSelected = selectedTooth === tooth.num
    const cond = getToothEntry(tooth.num)?.condition || 'healthy'
    const baseY = customBaseY ?? (isUpper ? 96 : 322)

    return (
      <g
        key={tooth.num}
        onClick={() => handleOpenTooth(tooth.num)}
        className="cursor-pointer group select-none transition-all duration-150"
      >
        <title>{`Tooth #${tooth.num} — ${tooth.name} (${cond.replace('_', ' ').toUpperCase()})`}</title>
        {isSelected && (
          <ellipse
            cx={tooth.slotX}
            cy={baseY + (isUpper ? -14 : 14) * customScale}
            rx={(tooth.width / 2 + 5) * customScale}
            ry={(tooth.height / 2 + 4) * customScale}
            fill="#0284C7"
            opacity="0.15"
          />
        )}
        <g transform={`translate(${tooth.slotX}, ${baseY}) scale(${customScale})`}>
          {renderToothLayers(tooth, tooth.num, isUpper, isSelected)}
        </g>
      </g>
    )
  }

  const activeTreatmentForSelected =
    selectedTooth !== null
      ? ongoingTreatments.find(
          (t) => t.teeth?.includes(selectedTooth) && (t.status === 'in_progress' || t.status === 'planned')
        )
      : undefined

  return (
    <div className="space-y-4 select-none">
      {/* Header & Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-slate-900 tracking-tight">Anatomical Odontogram</h3>
            <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
              {viewPerspective === 'panoramic'
                ? isMixed
                  ? 'Panoramic (4-Tier Mixed Anatomic)'
                  : 'Panoramic (Anatomic)'
                : 'Arch (Anatomic Curved Arch)'}
            </span>
          </div>
          <p className="text-xs font-semibold text-primary mt-0.5">{getDentitionLabel(ageForLabel, dentitionType)}</p>
        </div>

        {/* View Perspective Switcher */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200/80">
          <button
            type="button"
            onClick={() => setViewPerspective('panoramic')}
            className={cn(
              'px-2.5 py-1 text-xs font-bold rounded-lg transition-colors flex items-center gap-1',
              viewPerspective === 'panoramic' ? 'bg-primary text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            )}
          >
            <Sparkles className="w-3.5 h-3.5" />
            Panoramic (Anatomic)
          </button>
          <button
            type="button"
            onClick={() => setViewPerspective('arch')}
            className={cn(
              'px-2.5 py-1 text-xs font-bold rounded-lg transition-colors flex items-center gap-1',
              viewPerspective === 'arch' ? 'bg-primary text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
            )}
          >
            <Layers className="w-3.5 h-3.5" />
            Arch (Occlusal)
          </button>
        </div>
      </div>

      {/* Historical Snapshot Banner */}
      {isViewingHistorical && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-amber-600 shrink-0" />
            <div>
              <strong>Historical Chart Snapshot:</strong> Viewing mouth condition as of <strong>{selectedDate}</strong>.
              <span className="text-amber-700 block sm:inline sm:ml-1 text-[11px]">
                (Read-only retrospective view. Return to live to record new findings).
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setSelectedDate(null)}
            className="flex items-center gap-1 px-3 py-1 text-xs font-bold rounded-lg bg-amber-600 text-white hover:bg-amber-700 transition-colors shadow-xs self-end sm:self-auto"
          >
            <RotateCcw className="w-3 h-3" />
            Return to Live Chart
          </button>
        </div>
      )}

      {/* Timeline Milestone Scrubber */}
      {historyEntries.length > 0 && (
        <DentalChartTimeline
          historyEntries={historyEntries}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          selectedToothFilter={selectedToothFilter}
          onClearToothFilter={() => setSelectedToothFilter(null)}
        />
      )}

      {viewPerspective === 'panoramic' ? (
        <div className="space-y-2">
          <div className="flex sm:hidden items-center justify-between px-3 py-1.5 bg-sky-50 border border-sky-200 text-sky-800 text-[11px] rounded-xl font-medium">
            <span>⇄ Swipe horizontally to pan teeth</span>
            <button type="button" onClick={() => setViewPerspective('arch')} className="underline font-bold text-primary">
              Switch to Arch
            </button>
          </div>

          <div className="relative w-full bg-[#F8FAFC] rounded-2xl border border-slate-200/80 p-2 sm:p-4 overflow-x-auto shadow-inner">
            <div className="min-w-[820px] max-w-[860px] mx-auto">
              {isMixed ? (
                <svg viewBox="0 0 820 640" className="w-full h-auto">
                  <line x1="410" y1="15" x2="410" y2="625" stroke="#CBD5E1" strokeWidth="1.2" strokeDasharray="4 4" />
                  <line x1="30" y1="320" x2="790" y2="320" stroke="#CBD5E1" strokeWidth="1" strokeDasharray="3 3" />
                  <text x="18" y="324" fontSize="11" fontWeight="bold" fill="#64748B" textAnchor="middle">R</text>
                  <text x="802" y="324" fontSize="11" fontWeight="bold" fill="#64748B" textAnchor="middle">L</text>

                  {/* Tier 1: Upper Permanent */}
                  {mixedUpperPermanent.map((tooth) => renderPanoramicTooth(tooth, true, 75, 0.84))}
                  {mixedUpperPermanent.map((tooth) => (
                    <text key={`lu-perm-${tooth.num}`} x={tooth.slotX} y="124" textAnchor="middle" fontSize="10" fontFamily="monospace" fontWeight={selectedTooth === tooth.num ? 'bold' : '500'} fill={selectedTooth === tooth.num ? '#0284C7' : '#64748B'} className="cursor-pointer select-none" onClick={() => handleOpenTooth(tooth.num)}>{tooth.num}</text>
                  ))}
                  {mixedUpperPermanent.map((tooth) => renderStatusDot(tooth.num, tooth.slotX, 145, 0.84))}

                  {/* Tier 2: Upper Primary */}
                  {mixedUpperPrimary.map((tooth) => renderPanoramicTooth(tooth, true, 215, 0.74))}
                  {mixedUpperPrimary.map((tooth) => (
                    <text key={`lu-prim-${tooth.num}`} x={tooth.slotX} y="262" textAnchor="middle" fontSize="10" fontFamily="monospace" fontWeight={selectedTooth === tooth.num ? 'bold' : '600'} fill={selectedTooth === tooth.num ? '#0284C7' : '#0F766E'} className="cursor-pointer select-none" onClick={() => handleOpenTooth(tooth.num)}>{tooth.num}</text>
                  ))}
                  {mixedUpperPrimary.map((tooth) => renderStatusDot(tooth.num, tooth.slotX, 285, 0.82))}

                  {/* Tier 3: Lower Primary */}
                  {mixedLowerPrimary.map((tooth) => renderStatusDot(tooth.num, tooth.slotX, 355, 0.82))}
                  {mixedLowerPrimary.map((tooth) => (
                    <text key={`ll-prim-${tooth.num}`} x={tooth.slotX} y="378" textAnchor="middle" fontSize="10" fontFamily="monospace" fontWeight={selectedTooth === tooth.num ? 'bold' : '600'} fill={selectedTooth === tooth.num ? '#0284C7' : '#0F766E'} className="cursor-pointer select-none" onClick={() => handleOpenTooth(tooth.num)}>{tooth.num}</text>
                  ))}
                  {mixedLowerPrimary.map((tooth) => renderPanoramicTooth(tooth, false, 425, 0.74))}

                  {/* Tier 4: Lower Permanent */}
                  {mixedLowerPermanent.map((tooth) => renderStatusDot(tooth.num, tooth.slotX, 495, 0.84))}
                  {mixedLowerPermanent.map((tooth) => (
                    <text key={`ll-perm-${tooth.num}`} x={tooth.slotX} y="516" textAnchor="middle" fontSize="10" fontFamily="monospace" fontWeight={selectedTooth === tooth.num ? 'bold' : '500'} fill={selectedTooth === tooth.num ? '#0284C7' : '#64748B'} className="cursor-pointer select-none" onClick={() => handleOpenTooth(tooth.num)}>{tooth.num}</text>
                  ))}
                  {mixedLowerPermanent.map((tooth) => renderPanoramicTooth(tooth, false, 565, 0.84))}
                </svg>
              ) : (
                <svg viewBox="0 0 820 440" className="w-full h-auto">
                  <line x1="410" y1="15" x2="410" y2="425" stroke="#CBD5E1" strokeWidth="1.2" strokeDasharray="4 4" />
                  <line x1="30" y1="210" x2="790" y2="210" stroke="#CBD5E1" strokeWidth="1" strokeDasharray="3 3" />
                  <text x="18" y="214" fontSize="11" fontWeight="bold" fill="#64748B" textAnchor="middle">R</text>
                  <text x="802" y="214" fontSize="11" fontWeight="bold" fill="#64748B" textAnchor="middle">L</text>

                  {upperTeeth.map((tooth) => renderPanoramicTooth(tooth, true))}
                  {upperTeeth.map((tooth) => (
                    <text key={`lu-${tooth.num}`} x={tooth.slotX} y="156" textAnchor="middle" fontSize="10.5" fontFamily="monospace" fontWeight={selectedTooth === tooth.num ? 'bold' : '500'} fill={selectedTooth === tooth.num ? '#0284C7' : '#64748B'} className="cursor-pointer select-none" onClick={() => handleOpenTooth(tooth.num)}>{tooth.num}</text>
                  ))}
                  {upperTeeth.map((tooth) => renderStatusDot(tooth.num, tooth.slotX, 180))}

                  {lowerTeeth.map((tooth) => renderStatusDot(tooth.num, tooth.slotX, 240))}
                  {lowerTeeth.map((tooth) => (
                    <text key={`ll-${tooth.num}`} x={tooth.slotX} y="266" textAnchor="middle" fontSize="10.5" fontFamily="monospace" fontWeight={selectedTooth === tooth.num ? 'bold' : '500'} fill={selectedTooth === tooth.num ? '#0284C7' : '#64748B'} className="cursor-pointer select-none" onClick={() => handleOpenTooth(tooth.num)}>{tooth.num}</text>
                  ))}
                  {lowerTeeth.map((tooth) => renderPanoramicTooth(tooth, false))}
                </svg>
              )}
            </div>
          </div>
        </div>
      ) : (
        <div className="mx-auto w-full max-w-[460px] p-4 bg-white rounded-2xl border border-slate-100 shadow-xs">
          <p className="font-semibold text-center text-slate-700 text-xs mb-1.5">{getDentitionLabel(ageForLabel, dentitionType)}</p>
          <AnatomicArch
            dentitionType={dentitionType}
            onToothClick={handleOpenTooth}
            isSelected={(num) => selectedTooth === num}
            getToothTitle={(num) => `Tooth #${num} — ${getFDIToothName(num)}`}
            renderToothBody={(def, num) => renderToothLayers(def, num, def.arch === 'upper', selectedTooth === num)}
          />
        </div>
      )}

      {/* Condition Legend */}
      <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-slate-100">
        {(Object.keys(CONDITION_STYLES) as ToothCondition[]).map((key) => {
          const c = CONDITION_STYLES[key]
          return (
            <div key={key} className={cn('flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold', c.badgeBg, c.badgeText)}>
              <span className="w-2.5 h-2.5 rounded-full border border-current opacity-80" style={{ backgroundColor: c.circleFill }} />
              <span>{c.label}</span>
            </div>
          )
        })}
      </div>

      {/* Tooth History & Procedure Log */}
      {historyEntries.length > 0 && (
        <ToothHistoryList
          historyEntries={historyEntries}
          selectedToothFilter={selectedToothFilter}
          onSelectDate={setSelectedDate}
          onSelectToothFilter={setSelectedToothFilter}
        />
      )}

      {/* Edit Tooth Condition Modal */}
      {selectedTooth !== null && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelectedTooth(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b border-gray-200 flex items-start justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-bold">Tooth #{selectedTooth} — {getFDIToothName(selectedTooth)}</h2>
                <p className="text-xs text-slate-500 mt-0.5">Specify anatomical diagnosis and treatment findings</p>
              </div>
              <button type="button" onClick={() => setSelectedTooth(null)} className="p-1.5 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {activeTreatmentForSelected && (
                <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-amber-600 shrink-0" />
                  <div>
                    <strong>Active Treatment Plan:</strong> {activeTreatmentForSelected.treatmentType}
                    <div className="text-[11px] text-amber-700">
                      Status: <span className="capitalize">{activeTreatmentForSelected.status.replace('_', ' ')}</span> • Sittings:{' '}
                      {activeTreatmentForSelected.completedSittings || 0}/{activeTreatmentForSelected.totalSittings || 1}
                    </div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1.5">Procedure / Diagnosis Date</label>
                <input
                  type="date"
                  value={procedureDate}
                  onChange={(e) => setProcedureDate(e.target.value)}
                  className="w-full text-sm rounded-xl border border-gray-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1.5">Tooth Condition / Diagnosis</label>
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value as ToothCondition)}
                  className="w-full text-sm rounded-xl border border-gray-300 bg-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {(Object.keys(CONDITION_STYLES) as ToothCondition[]).map((key) => (
                    <option key={key} value={key}>{CONDITION_STYLES[key].label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 mb-1.5">Clinical Findings & Notes</label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Deep occlusal caries approaching pulp, vitality test negative, indicated for RCT or Crown"
                  className="w-full text-sm rounded-xl border border-gray-300 bg-white p-3 focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {(() => {
                const toothHistory = historyEntries.filter((h) => h.toothNumber === selectedTooth)
                if (toothHistory.length === 0) return null
                return (
                  <div className="space-y-1.5 pt-2 border-t border-gray-200">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Previous History for Tooth #{selectedTooth}:
                    </span>
                    <div className="space-y-1 max-h-24 overflow-y-auto">
                      {toothHistory.map((th) => (
                        <div key={th.id} className="text-[11px] bg-slate-50 p-2 rounded-lg border border-gray-200 flex items-center justify-between gap-2">
                          <span>
                            <strong>{th.procedureDate || th.createdAt.split('T')[0]}:</strong>{' '}
                            <span className="capitalize">{th.condition.replace('_', ' ')}</span>
                          </span>
                          {th.notes && <span className="text-slate-400 italic max-w-[150px] truncate">"{th.notes}"</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })()}

              <div className="flex justify-between items-center pt-3 border-t border-gray-200">
                <Button variant="outline" onClick={() => setSelectedTooth(null)}>Cancel</Button>
                <Button variant="primary" onClick={handleSaveTooth}>Save Diagnosis</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
