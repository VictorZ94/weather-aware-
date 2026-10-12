// @packages
import dayjs, { type Dayjs } from "dayjs";
import advancedFormat from "dayjs/plugin/advancedFormat";
import timezone from "dayjs/plugin/timezone";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(advancedFormat);

export function wallClockInZone(value: Dayjs, zone: string): Dayjs {
  return dayjs.tz(value.format("YYYY-MM-DDTHH:mm:ss"), zone);
}

export { dayjs, type Dayjs };
