const PALETTE = [
  '#2563EB','#7C3AED','#DB2777','#D97706','#059669',
  '#0891B2','#DC2626','#65A30D','#9333EA','#0284C7',
  '#B45309','#16A34A','#E11D48','#0369A1','#C2410C',
  '#0F766E','#6D28D9','#BE185D','#92400E','#166534',
  '#1D4ED8','#7E22CE','#BE123C','#B45309','#047857',
]

const assigned = {}
let idx = 0

export function getSubmarketColor(key) {
  if (!key) return '#6B7280'
  if (!assigned[key]) { assigned[key] = PALETTE[idx % PALETTE.length]; idx++ }
  return assigned[key]
}

// Alias for operator coloring
export const getOperatorColor = getSubmarketColor

export function getAllAssigned() { return { ...assigned } }

export function preassignColors(keys) { keys.forEach(k => getSubmarketColor(k)) }

// Scale area (sf) to a pixel radius for circle markers
// Small: ≤30k sf, Mid: 30k–75k sf, Large: >75k sf
export function areaToRadius(areaSf) {
  if (!areaSf) return 12
  if (areaSf <= 30000)  return 12   // small
  if (areaSf <= 75000)  return 22   // mid
  return 36                          // large
}
