export type WeightUnit = 'lb' | 'kg'

const LB_PER_KG = 2.20462262

export function toKg(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : value / LB_PER_KG
}

export function fromKg(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? kg : kg * LB_PER_KG
}
