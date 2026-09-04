// Ported verbatim from "v2 by AGY" (src/components/clinical/AnatomicalToothData.ts) so the
// anatomic tooth shapes in ClinicMx are pixel-for-pixel identical to that reference build.
// Do not hand-edit these path strings — regenerate from the AGY source if morphology changes.

export interface AnatomicalToothDef {
  num: number
  name: string
  arch: 'upper' | 'lower'
  quadrant: 1 | 2 | 3 | 4
  type: 'central_incisor' | 'lateral_incisor' | 'canine' | 'premolar_1' | 'premolar_2' | 'molar_1' | 'molar_2' | 'molar_3'
  slotX: number
  width: number
  height: number
  crownPath: string
  rootPath: string
  secondaryRootPath?: string // Background root (palatal root for molars)
  cervicalCurve: string // Anatomical CEJ curve
}

/**
 * 16 horizontal slot coordinates across an 820-wide canvas.
 * Centered evenly with natural dental arch spacing and midline gap.
 */
export const TOOTH_SLOT_X = [
  50,   98,  146,  194,  240,  284,  326,  368, // Q1 (18-11) / Q4 (48-41)
  452,  494,  536,  580,  626,  674,  722,  770  // Q2 (21-28) / Q3 (31-38)
]

/* ═══════════════════════════════════════════════════════════════════════════
   SMOOTH ORGANIC ANATOMICAL PATHS (Matching KeyMo & We-Dentify reference)
   Maxillary (Upper): Root points UP, Crown points DOWN
   Mandibular (Lower): Crown points UP, Root points DOWN
   ═══════════════════════════════════════════════════════════════════════════ */

// ── UPPER CENTRAL INCISOR (11, 21) ──
// Broad spatulate crown with rounded corners; sturdy conical root tapering smoothly to rounded apex
const U_CENTRAL_CROWN_R = 'M -14 -4 C -12 -7, 12 -7, 14 -4 C 15 10, 15 26, 13 36 C 13 38, -13 38, -13 36 C -15 26, -15 10, -14 -4 Z'
const U_CENTRAL_ROOT_R = 'M -12 -4 C -11 -26, -8 -50, 0 -62 C 8 -50, 11 -26, 12 -4 Z'
const U_CENTRAL_CEJ = 'M -13 -4 C -6 -8, 6 -8, 13 -4'

const U_CENTRAL_CROWN_L = 'M -14 -4 C -12 -7, 12 -7, 14 -4 C 15 10, 15 26, 13 36 C 13 38, -13 38, -13 36 C -15 26, -15 10, -14 -4 Z'
const U_CENTRAL_ROOT_L = 'M -12 -4 C -11 -26, -8 -50, 0 -62 C 8 -50, 11 -26, 12 -4 Z'

// ── UPPER LATERAL INCISOR (12, 22) ──
// Smaller spatulate crown; slender root with gentle distal apical curve
const U_LATERAL_CROWN_R = 'M -11 -4 C -9 -7, 9 -7, 11 -4 C 12 8, 12 24, 10 33 C 8 35, -8 35, -10 33 C -12 24, -12 8, -11 -4 Z'
const U_LATERAL_ROOT_R = 'M -9 -4 C -8 -24, -6 -46, -3 -58 C 2 -46, 6 -24, 9 -4 Z'
const U_LATERAL_CEJ = 'M -10 -4 C -5 -7, 5 -7, 10 -4'

const U_LATERAL_CROWN_L = 'M -11 -4 C -9 -7, 9 -7, 11 -4 C 12 8, 12 24, 10 33 C 8 35, -8 35, -10 33 C -12 24, -12 8, -11 -4 Z'
const U_LATERAL_ROOT_L = 'M -9 -4 C -6 -24, -2 -46, 3 -58 C 6 -46, 8 -24, 9 -4 Z'

// ── UPPER CANINE (13, 23) ──
// Cornerstone of arch: pointed diamond crown with sloping cusp ridges; longest, thickest root with distal curve
const U_CANINE_CROWN = 'M -12 -4 C -10 -7, 10 -7, 12 -4 C 14 10, 15 24, 10 33 L 0 40 L -10 33 C -15 24, -14 10, -12 -4 Z'
const U_CANINE_ROOT_R = 'M -10 -4 C -9 -28, -7 -52, -3 -68 C 3 -52, 7 -28, 10 -4 Z'
const U_CANINE_ROOT_L = 'M -10 -4 C -7 -28, -3 -52, 3 -68 C 7 -52, 9 -28, 10 -4 Z'
const U_CANINE_CEJ = 'M -11 -4 C -5 -8, 5 -8, 11 -4'

// ── UPPER PREMOLARS (14, 15, 24, 25) ──
// Bicuspid rounded crowns; premolar 1 has bifurcated roots, premolar 2 has smooth tapered single root
const U_PREMOLAR_1_CROWN = 'M -13 -4 C -10 -7, 10 -7, 13 -4 C 15 8, 16 22, 11 32 L 0 37 L -11 32 C -16 22, -15 8, -13 -4 Z'
const U_PREMOLAR_1_ROOT_R = 'M -11 -4 C -10 -22, -12 -42, -6 -56 C -3 -42, -1 -24, 0 -12 C 1 -24, 3 -42, 6 -56 C 12 -42, 10 -22, 11 -4 Z'
const U_PREMOLAR_1_ROOT_L = 'M -11 -4 C -10 -22, -12 -42, -6 -56 C -3 -42, -1 -24, 0 -12 C 1 -24, 3 -42, 6 -56 C 12 -42, 10 -22, 11 -4 Z'

const U_PREMOLAR_2_CROWN = 'M -13 -4 C -10 -7, 10 -7, 13 -4 C 15 8, 15 22, 10 32 C 5 35, -5 35, -10 32 C -15 22, -15 8, -13 -4 Z'
const U_PREMOLAR_2_ROOT_R = 'M -10 -4 C -9 -24, -6 -46, -2 -58 C 3 -46, 7 -24, 10 -4 Z'
const U_PREMOLAR_2_ROOT_L = 'M -10 -4 C -7 -24, -3 -46, 2 -58 C 6 -46, 9 -24, 10 -4 Z'
const U_PREMOLAR_CEJ = 'M -12 -4 C -6 -7, 6 -7, 12 -4'

// ── UPPER MOLARS (16, 17, 18, 26, 27, 28) ──
// Wide multi-cusped crowns with distinct buccal cusps; 3 divergent roots (2 buccal + 1 palatal in background)
const U_MOLAR_CROWN = 'M -18 -4 C -14 -7, 14 -7, 18 -4 C 21 8, 21 22, 16 32 C 8 36, 1 34, 0 34 C -1 34, -8 36, -16 32 C -21 22, -21 8, -18 -4 Z'
const U_MOLAR_ROOT_R = 'M -16 -4 C -16 -24, -19 -44, -12 -60 C -8 -46, -5 -28, -4 -14 C -1 -14, 1 -14, 4 -14 C 5 -28, 8 -46, 12 -60 C 19 -44, 16 -24, 16 -4 Z'
const U_MOLAR_PALATAL = 'M -6 -14 C -5 -30, -2 -48, 0 -64 C 2 -48, 5 -30, 6 -14 Z'
const U_MOLAR_ROOT_L = 'M -16 -4 C -16 -24, -19 -44, -12 -60 C -8 -46, -5 -28, -4 -14 C -1 -14, 1 -14, 4 -14 C 5 -28, 8 -46, 12 -60 C 19 -44, 16 -24, 16 -4 Z'
const U_MOLAR_CEJ = 'M -17 -4 C -8 -8, 8 -8, 17 -4'

// Upper 3rd Molar (Wisdom)
const U_MOLAR_3_CROWN = 'M -16 -4 C -13 -7, 13 -7, 16 -4 C 18 6, 18 20, 14 30 C 7 33, -7 33, -14 30 C -18 20, -18 6, -16 -4 Z'
const U_MOLAR_3_ROOT_R = 'M -14 -4 C -14 -22, -16 -38, -9 -52 C -4 -40, 1 -38, 5 -50 C 12 -38, 14 -22, 14 -4 Z'
const U_MOLAR_3_ROOT_L = 'M -14 -4 C -14 -22, -12 -38, -5 -50 C -1 -38, 4 -40, 9 -52 C 16 -38, 14 -22, 14 -4 Z'


/* ═══════════════════════════════════════════════════════════════════════════
   MANDIBULAR (LOWER) ARCH TEETH (Crowns point UP, Roots point DOWN)
   Incisal / Occlusal: Y ~ -34 to -38 | CEJ: Y ~ +4 | Root apex: Y ~ +58 to +64
   ═══════════════════════════════════════════════════════════════════════════ */

// ── LOWER CENTRAL INCISOR (41, 31) ──
// Smallest human teeth, narrow chisel crown, straight slender single root
const L_CENTRAL_CROWN = 'M -9 4 C -7 7, 7 7, 9 4 C 10 -8, 10 -22, 9 -32 C 9 -34, -9 -34, -9 -32 C -10 -22, -10 -8, -9 4 Z'
const L_CENTRAL_ROOT = 'M -7 4 C -6 24, -4 44, 0 58 C 4 44, 6 24, 7 4 Z'
const L_CENTRAL_CEJ = 'M -8 4 C -4 7, 4 7, 8 4'

// ── LOWER LATERAL INCISOR (42, 32) ──
// Slender chisel crown, single straight root
const L_LATERAL_CROWN = 'M -10 4 C -8 7, 8 7, 10 4 C 11 -8, 11 -22, 10 -32 C 9 -34, -9 -34, -10 -32 C -11 -22, -11 -8, -10 4 Z'
const L_LATERAL_ROOT_R = 'M -8 4 C -7 24, -4 46, -2 58 C 2 46, 6 24, 8 4 Z'
const L_LATERAL_ROOT_L = 'M -8 4 C -6 24, -2 46, 2 58 C 4 46, 7 24, 8 4 Z'
const L_LATERAL_CEJ = 'M -9 4 C -4 7, 4 7, 9 4'

// ── LOWER CANINE (43, 33) ──
// Pointed incisal cusp, robust single root curving gently distally
const L_CANINE_CROWN = 'M -11 4 C -9 7, 9 7, 11 4 C 13 -8, 14 -20, 9 -30 L 0 -36 L -9 -30 C -14 -20, -13 -8, -11 4 Z'
const L_CANINE_ROOT_R = 'M -9 4 C -8 26, -5 48, -2 64 C 3 48, 7 26, 9 4 Z'
const L_CANINE_ROOT_L = 'M -9 4 C -7 26, -3 48, 2 64 C 5 48, 8 26, 9 4 Z'
const L_CANINE_CEJ = 'M -10 4 C -5 8, 5 8, 10 4'

// ── LOWER PREMOLARS (44, 45, 34, 35) ──
// Rounded bicuspid crowns; single tapered root
const L_PREMOLAR_CROWN = 'M -12 4 C -9 7, 9 7, 12 4 C 14 -6, 15 -18, 10 -28 C 5 -32, -5 -32, -10 -28 C -15 -18, -14 -6, -12 4 Z'
const L_PREMOLAR_ROOT_R = 'M -9 4 C -8 24, -5 46, -2 58 C 3 46, 7 24, 9 4 Z'
const L_PREMOLAR_ROOT_L = 'M -9 4 C -7 24, -3 46, 2 58 C 5 46, 8 24, 9 4 Z'
const L_PREMOLAR_CEJ = 'M -11 4 C -5 7, 5 7, 11 4'

// ── LOWER MOLARS (46, 47, 48, 36, 37, 38) ──
// Broad crowns with 4-5 cusps; 2 robust bifurcated roots (mesial and distal) with curved furcation
const L_MOLAR_CROWN = 'M -18 4 C -14 7, 14 7, 18 4 C 21 -6, 21 -20, 16 -30 C 8 -34, 1 -32, 0 -32 C -1 -32, -8 -34, -16 -30 C -21 -20, -21 -6, -18 4 Z'
const L_MOLAR_ROOT_R = 'M -16 4 C -16 22, -19 42, -12 58 C -7 44, -4 28, -2 12 C 2 28, 5 44, 10 58 C 17 42, 15 22, 15 4 Z'
const L_MOLAR_ROOT_L = 'M -15 4 C -15 22, -17 42, -10 58 C -5 44, -2 28, 2 12 C 4 28, 7 44, 12 58 C 19 42, 16 22, 16 4 Z'
const L_MOLAR_CEJ = 'M -17 4 C -8 8, 8 8, 17 4'

// Lower 3rd Molar (Wisdom)
const L_MOLAR_3_CROWN = 'M -16 4 C -13 7, 13 7, 16 4 C 18 -6, 18 -18, 14 -28 C 7 -32, -7 -32, -14 -28 C -18 -18, -18 -6, -16 4 Z'
const L_MOLAR_3_ROOT_R = 'M -14 4 C -14 20, -15 36, -8 48 C -3 36, 1 34, 5 46 C 12 34, 13 20, 13 4 Z'
const L_MOLAR_3_ROOT_L = 'M -13 4 C -13 20, -12 34, -5 46 C -1 34, 3 36, 8 48 C 15 36, 14 20, 14 4 Z'


/* ═══════════════════════════════════════════════════════════════════════════
   32 FULL ANATOMICAL ADULT TEETH DEFINITIONS
   ═══════════════════════════════════════════════════════════════════════════ */
export const ANATOMICAL_TEETH_32: AnatomicalToothDef[] = [
  // ── UPPER RIGHT (Q1: 18 -> 11) ──
  {
    num: 18,
    name: 'Upper Right 3rd Molar (Wisdom)',
    arch: 'upper',
    quadrant: 1,
    type: 'molar_3',
    slotX: TOOTH_SLOT_X[0],
    width: 36,
    height: 94,
    crownPath: U_MOLAR_3_CROWN,
    rootPath: U_MOLAR_3_ROOT_R,
    cervicalCurve: U_MOLAR_CEJ,
  },
  {
    num: 17,
    name: 'Upper Right 2nd Molar',
    arch: 'upper',
    quadrant: 1,
    type: 'molar_2',
    slotX: TOOTH_SLOT_X[1],
    width: 40,
    height: 102,
    crownPath: U_MOLAR_CROWN,
    rootPath: U_MOLAR_ROOT_R,
    secondaryRootPath: U_MOLAR_PALATAL,
    cervicalCurve: U_MOLAR_CEJ,
  },
  {
    num: 16,
    name: 'Upper Right 1st Molar',
    arch: 'upper',
    quadrant: 1,
    type: 'molar_1',
    slotX: TOOTH_SLOT_X[2],
    width: 42,
    height: 104,
    crownPath: U_MOLAR_CROWN,
    rootPath: U_MOLAR_ROOT_R,
    secondaryRootPath: U_MOLAR_PALATAL,
    cervicalCurve: U_MOLAR_CEJ,
  },
  {
    num: 15,
    name: 'Upper Right 2nd Premolar',
    arch: 'upper',
    quadrant: 1,
    type: 'premolar_2',
    slotX: TOOTH_SLOT_X[3],
    width: 32,
    height: 98,
    crownPath: U_PREMOLAR_2_CROWN,
    rootPath: U_PREMOLAR_2_ROOT_R,
    cervicalCurve: U_PREMOLAR_CEJ,
  },
  {
    num: 14,
    name: 'Upper Right 1st Premolar',
    arch: 'upper',
    quadrant: 1,
    type: 'premolar_1',
    slotX: TOOTH_SLOT_X[4],
    width: 32,
    height: 100,
    crownPath: U_PREMOLAR_1_CROWN,
    rootPath: U_PREMOLAR_1_ROOT_R,
    cervicalCurve: U_PREMOLAR_CEJ,
  },
  {
    num: 13,
    name: 'Upper Right Canine',
    arch: 'upper',
    quadrant: 1,
    type: 'canine',
    slotX: TOOTH_SLOT_X[5],
    width: 30,
    height: 112,
    crownPath: U_CANINE_CROWN,
    rootPath: U_CANINE_ROOT_R,
    cervicalCurve: U_CANINE_CEJ,
  },
  {
    num: 12,
    name: 'Upper Right Lateral Incisor',
    arch: 'upper',
    quadrant: 1,
    type: 'lateral_incisor',
    slotX: TOOTH_SLOT_X[6],
    width: 26,
    height: 98,
    crownPath: U_LATERAL_CROWN_R,
    rootPath: U_LATERAL_ROOT_R,
    cervicalCurve: U_LATERAL_CEJ,
  },
  {
    num: 11,
    name: 'Upper Right Central Incisor',
    arch: 'upper',
    quadrant: 1,
    type: 'central_incisor',
    slotX: TOOTH_SLOT_X[7],
    width: 32,
    height: 102,
    crownPath: U_CENTRAL_CROWN_R,
    rootPath: U_CENTRAL_ROOT_R,
    cervicalCurve: U_CENTRAL_CEJ,
  },

  // ── UPPER LEFT (Q2: 21 -> 28) ──
  {
    num: 21,
    name: 'Upper Left Central Incisor',
    arch: 'upper',
    quadrant: 2,
    type: 'central_incisor',
    slotX: TOOTH_SLOT_X[8],
    width: 32,
    height: 102,
    crownPath: U_CENTRAL_CROWN_L,
    rootPath: U_CENTRAL_ROOT_L,
    cervicalCurve: U_CENTRAL_CEJ,
  },
  {
    num: 22,
    name: 'Upper Left Lateral Incisor',
    arch: 'upper',
    quadrant: 2,
    type: 'lateral_incisor',
    slotX: TOOTH_SLOT_X[9],
    width: 26,
    height: 98,
    crownPath: U_LATERAL_CROWN_L,
    rootPath: U_LATERAL_ROOT_L,
    cervicalCurve: U_LATERAL_CEJ,
  },
  {
    num: 23,
    name: 'Upper Left Canine',
    arch: 'upper',
    quadrant: 2,
    type: 'canine',
    slotX: TOOTH_SLOT_X[10],
    width: 30,
    height: 112,
    crownPath: U_CANINE_CROWN,
    rootPath: U_CANINE_ROOT_L,
    cervicalCurve: U_CANINE_CEJ,
  },
  {
    num: 24,
    name: 'Upper Left 1st Premolar',
    arch: 'upper',
    quadrant: 2,
    type: 'premolar_1',
    slotX: TOOTH_SLOT_X[11],
    width: 32,
    height: 100,
    crownPath: U_PREMOLAR_1_CROWN,
    rootPath: U_PREMOLAR_1_ROOT_L,
    cervicalCurve: U_PREMOLAR_CEJ,
  },
  {
    num: 25,
    name: 'Upper Left 2nd Premolar',
    arch: 'upper',
    quadrant: 2,
    type: 'premolar_2',
    slotX: TOOTH_SLOT_X[12],
    width: 32,
    height: 98,
    crownPath: U_PREMOLAR_2_CROWN,
    rootPath: U_PREMOLAR_2_ROOT_L,
    cervicalCurve: U_PREMOLAR_CEJ,
  },
  {
    num: 26,
    name: 'Upper Left 1st Molar',
    arch: 'upper',
    quadrant: 2,
    type: 'molar_1',
    slotX: TOOTH_SLOT_X[13],
    width: 42,
    height: 104,
    crownPath: U_MOLAR_CROWN,
    rootPath: U_MOLAR_ROOT_L,
    secondaryRootPath: U_MOLAR_PALATAL,
    cervicalCurve: U_MOLAR_CEJ,
  },
  {
    num: 27,
    name: 'Upper Left 2nd Molar',
    arch: 'upper',
    quadrant: 2,
    type: 'molar_2',
    slotX: TOOTH_SLOT_X[14],
    width: 40,
    height: 102,
    crownPath: U_MOLAR_CROWN,
    rootPath: U_MOLAR_ROOT_L,
    secondaryRootPath: U_MOLAR_PALATAL,
    cervicalCurve: U_MOLAR_CEJ,
  },
  {
    num: 28,
    name: 'Upper Left 3rd Molar (Wisdom)',
    arch: 'upper',
    quadrant: 2,
    type: 'molar_3',
    slotX: TOOTH_SLOT_X[15],
    width: 36,
    height: 94,
    crownPath: U_MOLAR_3_CROWN,
    rootPath: U_MOLAR_3_ROOT_L,
    cervicalCurve: U_MOLAR_CEJ,
  },

  // ── LOWER RIGHT (Q4: 48 -> 41) ──
  {
    num: 48,
    name: 'Lower Right 3rd Molar (Wisdom)',
    arch: 'lower',
    quadrant: 4,
    type: 'molar_3',
    slotX: TOOTH_SLOT_X[0],
    width: 36,
    height: 90,
    crownPath: L_MOLAR_3_CROWN,
    rootPath: L_MOLAR_3_ROOT_R,
    cervicalCurve: L_MOLAR_CEJ,
  },
  {
    num: 47,
    name: 'Lower Right 2nd Molar',
    arch: 'lower',
    quadrant: 4,
    type: 'molar_2',
    slotX: TOOTH_SLOT_X[1],
    width: 40,
    height: 98,
    crownPath: L_MOLAR_CROWN,
    rootPath: L_MOLAR_ROOT_R,
    cervicalCurve: L_MOLAR_CEJ,
  },
  {
    num: 46,
    name: 'Lower Right 1st Molar',
    arch: 'lower',
    quadrant: 4,
    type: 'molar_1',
    slotX: TOOTH_SLOT_X[2],
    width: 42,
    height: 100,
    crownPath: L_MOLAR_CROWN,
    rootPath: L_MOLAR_ROOT_R,
    cervicalCurve: L_MOLAR_CEJ,
  },
  {
    num: 45,
    name: 'Lower Right 2nd Premolar',
    arch: 'lower',
    quadrant: 4,
    type: 'premolar_2',
    slotX: TOOTH_SLOT_X[3],
    width: 30,
    height: 94,
    crownPath: L_PREMOLAR_CROWN,
    rootPath: L_PREMOLAR_ROOT_R,
    cervicalCurve: L_PREMOLAR_CEJ,
  },
  {
    num: 44,
    name: 'Lower Right 1st Premolar',
    arch: 'lower',
    quadrant: 4,
    type: 'premolar_1',
    slotX: TOOTH_SLOT_X[4],
    width: 30,
    height: 94,
    crownPath: L_PREMOLAR_CROWN,
    rootPath: L_PREMOLAR_ROOT_R,
    cervicalCurve: L_PREMOLAR_CEJ,
  },
  {
    num: 43,
    name: 'Lower Right Canine',
    arch: 'lower',
    quadrant: 4,
    type: 'canine',
    slotX: TOOTH_SLOT_X[5],
    width: 28,
    height: 106,
    crownPath: L_CANINE_CROWN,
    rootPath: L_CANINE_ROOT_R,
    cervicalCurve: L_CANINE_CEJ,
  },
  {
    num: 42,
    name: 'Lower Right Lateral Incisor',
    arch: 'lower',
    quadrant: 4,
    type: 'lateral_incisor',
    slotX: TOOTH_SLOT_X[6],
    width: 24,
    height: 94,
    crownPath: L_LATERAL_CROWN,
    rootPath: L_LATERAL_ROOT_R,
    cervicalCurve: L_LATERAL_CEJ,
  },
  {
    num: 41,
    name: 'Lower Right Central Incisor',
    arch: 'lower',
    quadrant: 4,
    type: 'central_incisor',
    slotX: TOOTH_SLOT_X[7],
    width: 22,
    height: 92,
    crownPath: L_CENTRAL_CROWN,
    rootPath: L_CENTRAL_ROOT,
    cervicalCurve: L_CENTRAL_CEJ,
  },

  // ── LOWER LEFT (Q3: 31 -> 38) ──
  {
    num: 31,
    name: 'Lower Left Central Incisor',
    arch: 'lower',
    quadrant: 3,
    type: 'central_incisor',
    slotX: TOOTH_SLOT_X[8],
    width: 22,
    height: 92,
    crownPath: L_CENTRAL_CROWN,
    rootPath: L_CENTRAL_ROOT,
    cervicalCurve: L_CENTRAL_CEJ,
  },
  {
    num: 32,
    name: 'Lower Left Lateral Incisor',
    arch: 'lower',
    quadrant: 3,
    type: 'lateral_incisor',
    slotX: TOOTH_SLOT_X[9],
    width: 24,
    height: 94,
    crownPath: L_LATERAL_CROWN,
    rootPath: L_LATERAL_ROOT_L,
    cervicalCurve: L_LATERAL_CEJ,
  },
  {
    num: 33,
    name: 'Lower Left Canine',
    arch: 'lower',
    quadrant: 3,
    type: 'canine',
    slotX: TOOTH_SLOT_X[10],
    width: 28,
    height: 106,
    crownPath: L_CANINE_CROWN,
    rootPath: L_CANINE_ROOT_L,
    cervicalCurve: L_CANINE_CEJ,
  },
  {
    num: 34,
    name: 'Lower Left 1st Premolar',
    arch: 'lower',
    quadrant: 3,
    type: 'premolar_1',
    slotX: TOOTH_SLOT_X[11],
    width: 30,
    height: 94,
    crownPath: L_PREMOLAR_CROWN,
    rootPath: L_PREMOLAR_ROOT_L,
    cervicalCurve: L_PREMOLAR_CEJ,
  },
  {
    num: 35,
    name: 'Lower Left 2nd Premolar',
    arch: 'lower',
    quadrant: 3,
    type: 'premolar_2',
    slotX: TOOTH_SLOT_X[12],
    width: 30,
    height: 94,
    crownPath: L_PREMOLAR_CROWN,
    rootPath: L_PREMOLAR_ROOT_L,
    cervicalCurve: L_PREMOLAR_CEJ,
  },
  {
    num: 36,
    name: 'Lower Left 1st Molar',
    arch: 'lower',
    quadrant: 3,
    type: 'molar_1',
    slotX: TOOTH_SLOT_X[13],
    width: 42,
    height: 100,
    crownPath: L_MOLAR_CROWN,
    rootPath: L_MOLAR_ROOT_L,
    cervicalCurve: L_MOLAR_CEJ,
  },
  {
    num: 37,
    name: 'Lower Left 2nd Molar',
    arch: 'lower',
    quadrant: 3,
    type: 'molar_2',
    slotX: TOOTH_SLOT_X[14],
    width: 40,
    height: 98,
    crownPath: L_MOLAR_CROWN,
    rootPath: L_MOLAR_ROOT_L,
    cervicalCurve: L_MOLAR_CEJ,
  },
  {
    num: 38,
    name: 'Lower Left 3rd Molar (Wisdom)',
    arch: 'lower',
    quadrant: 3,
    type: 'molar_3',
    slotX: TOOTH_SLOT_X[15],
    width: 36,
    height: 90,
    crownPath: L_MOLAR_3_CROWN,
    rootPath: L_MOLAR_3_ROOT_L,
    cervicalCurve: L_MOLAR_CEJ,
  },
]
