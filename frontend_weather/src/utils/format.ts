import { dayjs } from './dayjs'
import { celsiusToFahrenheit, inchesToMm, type TemperatureUnit } from './units'

export function formatMiles(miles: number): string {
  return `${Math.round(miles).toLocaleString('en-US')} mi`
}

export function formatDuration(minutes: number): string {
  const total = Math.round(minutes)
  const hours = Math.floor(total / 60)
  const rest = total % 60
  if (hours === 0) return `${rest} min`
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`
}

// Local time at the place the instant refers to, e.g. "Mon 2:40 PM CDT".
export function formatLocalTime(iso: string, zone: string, pattern = 'ddd h:mm A z'): string {
  return dayjs(iso).tz(zone).format(pattern)
}

export function formatTemperature(celsius: number, unit: TemperatureUnit): string {
  const value = unit === 'C' ? celsius : celsiusToFahrenheit(celsius)
  return `${Math.round(value)} °${unit}`
}

// Django sends precipitation in inches per hour (the unit of the risk rules).
// Display follows the temperature unit: inches with °F, metric with °C.
export function formatRain(inches: number, unit: TemperatureUnit): string {
  return unit === 'C' ? `${inchesToMm(inches).toFixed(1)} mm/h` : `${inches.toFixed(2)} in/h`
}

export function formatSnow(inches: number, unit: TemperatureUnit): string {
  return unit === 'C' ? `${(inchesToMm(inches) / 10).toFixed(1)} cm/h` : `${inches.toFixed(1)} in/h`
}
