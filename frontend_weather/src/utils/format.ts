// @scripts
import { dayjs } from "./dayjs";

export function formatMiles(miles: number): string {
  return `${Math.round(miles).toLocaleString("en-US")} mi`;
}

export function formatDuration(minutes: number): string {
  const total = Math.round(minutes);
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

export function formatLocalTime(
  iso: string,
  zone: string,
  pattern = "ddd h:mm A z",
): string {
  return dayjs(iso).tz(zone).format(pattern);
}

// Django sends precipitation in inches per hour (the unit of the risk rules).
export function formatRain(inches: number): string {
  return `${inches.toFixed(2)} in/h`;
}

export function formatSnow(inches: number): string {
  return `${inches.toFixed(1)} in/h`;
}
