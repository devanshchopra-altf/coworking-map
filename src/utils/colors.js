const PALETTE = [
  '#2563EB', '#7C3AED', '#DB2777', '#D97706', '#059669',
  '#0891B2', '#DC2626', '#65A30D', '#9333EA', '#0284C7',
  '#B45309', '#16A34A', '#E11D48', '#0369A1', '#C2410C',
  '#0F766E', '#6D28D9', '#BE185D', '#92400E', '#166534',
]

const assigned = {}
let idx = 0

export function getSubmarketColor(submarket) {
  if (!submarket) return '#6B7280'
  if (!assigned[submarket]) {
    assigned[submarket] = PALETTE[idx % PALETTE.length]
    idx++
  }
  return assigned[submarket]
}

export function getAllAssigned() {
  return { ...assigned }
}

export function preassignColors(submarkets) {
  submarkets.forEach(sm => getSubmarketColor(sm))
}
