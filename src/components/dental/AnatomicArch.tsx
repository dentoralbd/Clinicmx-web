import React from 'react'
import type { DentitionType } from '@/lib/ageTier'
import { getEquivalentPermanentTooth, getFDIToothName } from '@/lib/fdiChart'
import { ANATOMICAL_TEETH_32, AnatomicalToothDef } from './AnatomicalToothData'

// Shared curved-arch (occlusal) anatomic renderer, extracted from "v2 by AGY"'s
// DentalChart.renderAnatomicalArchTooth so BOTH the main odontogram (its Arch view) and the
// compact ToothSelector picker draw the exact same anatomically-accurate teeth. It owns the
// elliptical arch geometry + FDI labels and delegates each tooth's fill/layers to renderTooth().

const PERMANENT_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28]
const PERMANENT_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38]
const PRIMARY_UPPER = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65]
const PRIMARY_LOWER = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75]

export const ARCH_VIEW_W = 440
export const ARCH_VIEW_H = 560
const ARCH_CX = ARCH_VIEW_W / 2

interface ArchGeometry {
  rx: number
  ry: number
  cy: number
  scale: number
  labelOffset: number
  fontSize: number
}

const UPPER_ARCH_GEOMETRY: ArchGeometry = { rx: 145, ry: 195, cy: 250, scale: 0.52, labelOffset: 34, fontSize: 11 }
const LOWER_ARCH_GEOMETRY: ArchGeometry = { rx: 135, ry: 185, cy: 290, scale: 0.52, labelOffset: 34, fontSize: 11 }
const PRIMARY_INNER_UPPER_GEOMETRY: ArchGeometry = { rx: 82, ry: 114, cy: 250, scale: 0.38, labelOffset: 24, fontSize: 9.5 }
const PRIMARY_INNER_LOWER_GEOMETRY: ArchGeometry = { rx: 76, ry: 106, cy: 290, scale: 0.38, labelOffset: 24, fontSize: 9.5 }
const PRIMARY_SOLO_UPPER_GEOMETRY: ArchGeometry = { rx: 120, ry: 158, cy: 250, scale: 0.48, labelOffset: 32, fontSize: 11 }
const PRIMARY_SOLO_LOWER_GEOMETRY: ArchGeometry = { rx: 115, ry: 150, cy: 290, scale: 0.48, labelOffset: 32, fontSize: 11 }

/** Resolves a tooth number (permanent or primary) to its anatomical morphology definition. */
export function getToothDef(toothNum: number): AnatomicalToothDef | undefined {
  const permNum = getEquivalentPermanentTooth(toothNum)
  const base = ANATOMICAL_TEETH_32.find((t) => t.num === permNum)
  if (!base) return undefined
  if (toothNum < 51) return base
  const quadrant = Math.floor(toothNum / 10)
  const mappedQuad = (quadrant === 5 ? 1 : quadrant === 6 ? 2 : quadrant === 7 ? 3 : 4) as 1 | 2 | 3 | 4
  return {
    ...base,
    num: toothNum,
    arch: toothNum <= 65 ? 'upper' : 'lower',
    quadrant: mappedQuad,
    name: getFDIToothName(toothNum),
  }
}

export interface AnatomicArchProps {
  dentitionType: DentitionType
  compact?: boolean
  onToothClick: (num: number) => void
  getToothTitle?: (num: number) => string
  /** When it returns true the tooth is drawn with the active-selection ring + bold label. */
  isSelected?: (num: number) => boolean
  /** Draws the tooth's inner body (roots + crown + condition layers) at native path coords. */
  renderToothBody: (toothDef: AnatomicalToothDef, num: number) => React.ReactNode
}

export function AnatomicArch({
  dentitionType,
  compact = false,
  onToothClick,
  getToothTitle,
  isSelected,
  renderToothBody,
}: AnatomicArchProps) {
  const showPermanent = dentitionType === 'permanent' || dentitionType === 'mixed'
  const showPrimary = dentitionType === 'deciduous' || dentitionType === 'mixed'

  const upperPrimaryGeom = dentitionType === 'deciduous' ? PRIMARY_SOLO_UPPER_GEOMETRY : PRIMARY_INNER_UPPER_GEOMETRY
  const lowerPrimaryGeom = dentitionType === 'deciduous' ? PRIMARY_SOLO_LOWER_GEOMETRY : PRIMARY_INNER_LOWER_GEOMETRY

  const renderArchTooth = (
    toothNum: number,
    isUpper: boolean,
    idx: number,
    totalCount: number,
    geometry: ArchGeometry
  ) => {
    const toothDef = getToothDef(toothNum)
    if (!toothDef) return null

    const { rx, ry, cy, scale, labelOffset, fontSize } = geometry
    const ySign = isUpper ? -1 : 1
    const selected = isSelected ? isSelected(toothNum) : false

    const theta = Math.PI * (1 - idx / (totalCount - 1))
    const deg = (theta * 180) / Math.PI
    const x = ARCH_CX + rx * Math.cos(theta)
    const y = cy + ySign * ry * Math.sin(theta)

    const rotation = isUpper ? 270 - deg : deg + 90
    const labelX = ARCH_CX + (rx + labelOffset) * Math.cos(theta)
    const labelY = cy + ySign * (ry + labelOffset) * Math.sin(theta)

    const toothTransform = `translate(${x} ${y}) rotate(${rotation}) scale(${scale})`

    return (
      <g
        key={`arch-${toothNum}`}
        onClick={() => onToothClick(toothNum)}
        className="cursor-pointer group select-none transition-all"
      >
        <title>{getToothTitle ? getToothTitle(toothNum) : `Tooth #${toothNum} — ${toothDef.name}`}</title>

        {selected && (
          <circle cx={x} cy={y} r={16} fill="#0284C7" opacity="0.18" className="animate-pulse" />
        )}

        {/* Click hit area */}
        <circle cx={x} cy={y} r={15} fill="transparent" stroke="none" />

        <g transform={toothTransform}>{renderToothBody(toothDef, toothNum)}</g>

        <text
          x={labelX}
          y={labelY}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={fontSize}
          fontFamily="monospace"
          fontWeight={selected ? 'bold' : '600'}
          fill={selected ? '#0284C7' : '#64748B'}
          className="select-none transition-colors"
        >
          {toothNum}
        </text>
      </g>
    )
  }

  return (
    <div className={`mx-auto w-full select-none ${compact ? 'max-w-[300px]' : 'max-w-[460px]'}`}>
      <div className="flex justify-between text-slate-400 px-3 mb-1 text-xs font-semibold">
        <span>Patient's Right</span>
        <span>Patient's Left</span>
      </div>
      <p className="font-semibold text-center text-slate-500 uppercase tracking-wide text-xs mb-1">MAXILLA (UPPER)</p>
      <svg viewBox={`0 0 ${ARCH_VIEW_W} ${ARCH_VIEW_H}`} className="w-full h-auto drop-shadow-xs">
        {/* Center crosshair dividers */}
        <line x1={ARCH_CX} y1="20" x2={ARCH_CX} y2={ARCH_VIEW_H - 20} stroke="#E2E8F0" strokeWidth="1" strokeDasharray="3 3" />
        <line x1="30" y1="270" x2={ARCH_VIEW_W - 30} y2="270" stroke="#E2E8F0" strokeWidth="1" strokeDasharray="3 3" />

        {/* Upper Jaw Arch Teeth */}
        {showPermanent &&
          PERMANENT_UPPER.map((num, idx) =>
            renderArchTooth(num, true, idx, PERMANENT_UPPER.length, UPPER_ARCH_GEOMETRY)
          )}
        {showPrimary &&
          PRIMARY_UPPER.map((num, idx) => renderArchTooth(num, true, idx, PRIMARY_UPPER.length, upperPrimaryGeom))}

        {/* Lower Jaw Arch Teeth */}
        {showPermanent &&
          PERMANENT_LOWER.map((num, idx) =>
            renderArchTooth(num, false, idx, PERMANENT_LOWER.length, LOWER_ARCH_GEOMETRY)
          )}
        {showPrimary &&
          PRIMARY_LOWER.map((num, idx) => renderArchTooth(num, false, idx, PRIMARY_LOWER.length, lowerPrimaryGeom))}
      </svg>
      <p className="font-semibold text-center text-slate-500 uppercase tracking-wide text-xs mt-1">MANDIBLE (LOWER)</p>
    </div>
  )
}
