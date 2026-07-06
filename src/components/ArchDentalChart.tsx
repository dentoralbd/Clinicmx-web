import type { DentitionType } from '@/lib/ageTier'

// FDI quadrant sequences laid out along each arch, patient's right on
// screen-left (matching the previous row-based chart and the standard
// FDI arch diagram): right-distal → right-mesial → left-mesial → left-distal.
const PERMANENT_UPPER = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28]
const PERMANENT_LOWER = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38]
const PRIMARY_UPPER = [55, 54, 53, 52, 51, 61, 62, 63, 64, 65]
const PRIMARY_LOWER = [85, 84, 83, 82, 81, 71, 72, 73, 74, 75]

// Same tooth outline used by the old row-based charts (32×48 box, crown at top).
const TOOTH_PATH =
  'M16 2 C10 2, 6 6, 6 12 C6 18, 8 24, 10 32 C11 36, 12 42, 16 46 C20 42, 21 36, 22 32 C24 24, 26 18, 26 12 C26 6, 22 2, 16 2 Z'

const VIEW_W = 400
const CX = VIEW_W / 2

interface ArchGeometry {
  rx: number
  ry: number
  scale: number
  labelOffset: number
  fontSize: number
  hitRadius: number
}

const PERMANENT_GEOMETRY: ArchGeometry = { rx: 150, ry: 205, scale: 0.85, labelOffset: 37, fontSize: 11, hitRadius: 15 }
// Inner arch when shown alongside the permanent teeth (mixed dentition).
const PRIMARY_INNER_GEOMETRY: ArchGeometry = { rx: 85, ry: 122, scale: 0.58, labelOffset: 28, fontSize: 9.5, hitRadius: 12 }
// Larger single arch when only primary teeth are shown (deciduous dentition).
const PRIMARY_SOLO_GEOMETRY: ArchGeometry = { rx: 120, ry: 150, scale: 0.72, labelOffset: 34, fontSize: 11, hitRadius: 14 }

interface ToothCallbacks {
  getToothClass: (num: number) => string
  onToothClick: (num: number) => void
  getToothTitle?: (num: number) => string
}

function ArchTeeth({
  teeth,
  isUpper,
  cy,
  geometry,
  compact,
  getToothClass,
  onToothClick,
  getToothTitle,
}: ToothCallbacks & {
  teeth: number[]
  isUpper: boolean
  cy: number
  geometry: ArchGeometry
  compact: boolean
}) {
  const { rx, ry, scale, labelOffset, hitRadius } = geometry
  // Compact charts render in a narrower container, so bump the label size
  // (in viewBox units) to keep numbers legible.
  const fontSize = compact ? geometry.fontSize + 2 : geometry.fontSize
  const ySign = isUpper ? -1 : 1

  return (
    <>
      {teeth.map((num, i) => {
        const theta = Math.PI * (1 - i / (teeth.length - 1)) // 180° → 0°
        const deg = (theta * 180) / Math.PI
        const x = CX + rx * Math.cos(theta)
        const y = cy + ySign * ry * Math.sin(theta)
        // Rotate so the crown points outward from the arch.
        const rotation = isUpper ? 90 - deg : deg + 90
        const labelX = CX + (rx + labelOffset) * Math.cos(theta)
        const labelY = cy + ySign * (ry + labelOffset) * Math.sin(theta)
        return (
          <g
            key={num}
            className={`cursor-pointer transition-colors ${getToothClass(num)}`}
            onClick={() => onToothClick(num)}
          >
            <title>{getToothTitle ? getToothTitle(num) : `Tooth ${num}`}</title>
            <circle cx={x} cy={y} r={hitRadius} fill="transparent" stroke="none" />
            <path
              d={TOOTH_PATH}
              strokeWidth={2}
              transform={`translate(${x} ${y}) rotate(${rotation}) scale(${scale}) translate(-16 -24)`}
            />
            <text
              x={labelX}
              y={labelY}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={fontSize}
              className="fill-gray-500 font-medium"
              stroke="none"
            >
              {num}
            </text>
          </g>
        )
      })}
    </>
  )
}

interface JawArchProps extends ToothCallbacks {
  jaw: 'upper' | 'lower'
  dentitionType: DentitionType
  compact: boolean
}

function JawArch({ jaw, dentitionType, compact, ...callbacks }: JawArchProps) {
  const isUpper = jaw === 'upper'
  const showPermanent = dentitionType === 'permanent' || dentitionType === 'mixed'
  const showPrimary = dentitionType === 'deciduous' || dentitionType === 'mixed'

  const height = dentitionType === 'deciduous' ? 225 : 280
  const cy = isUpper ? height - 22 : 22

  const permanentTeeth = isUpper ? PERMANENT_UPPER : PERMANENT_LOWER
  const primaryTeeth = isUpper ? PRIMARY_UPPER : PRIMARY_LOWER
  const primaryGeometry = dentitionType === 'deciduous' ? PRIMARY_SOLO_GEOMETRY : PRIMARY_INNER_GEOMETRY

  return (
    <svg viewBox={`0 0 ${VIEW_W} ${height}`} className="w-full">
      {showPermanent && (
        <ArchTeeth teeth={permanentTeeth} isUpper={isUpper} cy={cy} geometry={PERMANENT_GEOMETRY} compact={compact} {...callbacks} />
      )}
      {showPrimary && (
        <ArchTeeth teeth={primaryTeeth} isUpper={isUpper} cy={cy} geometry={primaryGeometry} compact={compact} {...callbacks} />
      )}
    </svg>
  )
}

export interface ArchDentalChartProps extends ToothCallbacks {
  dentitionType?: DentitionType
  compact?: boolean
}

export function ArchDentalChart({ dentitionType = 'permanent', compact = false, ...callbacks }: ArchDentalChartProps) {
  const jawLabelClass = `font-medium text-center text-text-secondary uppercase tracking-wide ${compact ? 'text-[10px]' : 'text-xs'}`
  return (
    <div className={`mx-auto w-full ${compact ? 'max-w-[280px]' : 'max-w-[420px]'}`}>
      <div className={`flex justify-between text-text-secondary px-1 mb-1 ${compact ? 'text-[10px]' : 'text-xs'}`}>
        <span>Patient's Right</span>
        <span>Patient's Left</span>
      </div>
      <p className={jawLabelClass}>Maxilla (Upper)</p>
      <JawArch jaw="upper" dentitionType={dentitionType} compact={compact} {...callbacks} />
      <div className="border-t border-dashed border-gray-300 my-2" />
      <JawArch jaw="lower" dentitionType={dentitionType} compact={compact} {...callbacks} />
      <p className={jawLabelClass}>Mandible (Lower)</p>
    </div>
  )
}
