import dayjs, { type Dayjs } from 'dayjs'
import advancedFormat from 'dayjs/plugin/advancedFormat'
import timezone from 'dayjs/plugin/timezone'
import utc from 'dayjs/plugin/utc'

dayjs.extend(utc)
dayjs.extend(timezone)
// Adds the `z` format token (zone abbreviation such as MDT).
dayjs.extend(advancedFormat)

// The date picker works in wall-clock time. This reads that wall-clock value
// as a time in the given zone, e.g. "6:00 AM" picked for a Denver origin.
export function wallClockInZone(value: Dayjs, zone: string): Dayjs {
  return dayjs.tz(value.format('YYYY-MM-DDTHH:mm:ss'), zone)
}

export { dayjs, type Dayjs }
