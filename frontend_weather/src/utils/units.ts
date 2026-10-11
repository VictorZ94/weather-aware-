export type WeightUnit = 'lb' | 'kg'
export type TemperatureUnit = 'F' | 'C'

const LB_PER_KG = 2.20462262
const MM_PER_INCH = 25.4

export function toKg(value: number, unit: WeightUnit): number {
  return unit === 'kg' ? value : value / LB_PER_KG
}

export function fromKg(kg: number, unit: WeightUnit): number {
  return unit === 'kg' ? kg : kg * LB_PER_KG
}

export function celsiusToFahrenheit(celsius: number): number {
  return (celsius * 9) / 5 + 32
}

export function inchesToMm(inches: number): number {
  return inches * MM_PER_INCH
}
