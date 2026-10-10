import { dayjs } from './dayjs'
import { celsiusToFahrenheit, mmToInches, type TemperatureUnit } from './units'

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

// Precipitation follows the temperature unit: inches with °F, metric with °C.
export function formatRain(mm: number, unit: TemperatureUnit): string {
  return unit === 'C' ? `${mm.toFixed(1)} mm/h` : `${mmToInches(mm).toFixed(2)} in/h`
}

export function formatSnow(cm: number, unit: TemperatureUnit): string {
  return unit === 'C' ? `${cm.toFixed(1)} cm/h` : `${mmToInches(cm * 10).toFixed(1)} in/h`
}
