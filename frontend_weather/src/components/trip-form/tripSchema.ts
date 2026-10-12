// @packages
import { z } from "zod";

// @scripts
import { CHECKPOINT_INTERVALS, placeSchema } from "../../api/schemas";
import { dayjs, wallClockInZone, type Dayjs } from "../../utils/dayjs";

export const MAX_DAYS_AHEAD = 7;

export const tripSchema = z
  .object({
    origin: placeSchema
      .nullable()
      .refine(
        (place) => place !== null,
        "Choose an origin from the suggestions",
      ),
    destination: placeSchema
      .nullable()
      .refine(
        (place) => place !== null,
        "Choose a destination from the suggestions",
      ),
    departure: z
      .custom<Dayjs | null>((value) => value === null || dayjs.isDayjs(value))
      .refine(
        (value) => value !== null && value.isValid(),
        "Enter a departure date and time",
      ),
    weight: z
      .string()
      .trim()
      .min(1, "Enter the cargo weight")
      .refine(
        (text) => Number.isFinite(Number(text)),
        "Cargo weight must be a number",
      )
      .refine(
        (text) => !(Number(text) <= 0),
        "Cargo weight must be greater than 0",
      ),
    interval: z.union(CHECKPOINT_INTERVALS.map((miles) => z.literal(miles))),
    weatherScenario: z.string(),
  })
  .superRefine((values, context) => {
    const { origin, destination, departure } = values;
    if (origin && destination && origin.id === destination.id) {
      context.addIssue({
        code: "custom",
        path: ["destination"],
        message: "Destination must be different from the origin",
      });
    }
    if (origin && departure?.isValid()) {
      const departsAt = wallClockInZone(departure, origin.timezone);
      if (departsAt.isBefore(dayjs().subtract(1, "minute"))) {
        context.addIssue({
          code: "custom",
          path: ["departure"],
          message: "Departure cannot be in the past",
        });
      }
      if (departsAt.isAfter(dayjs().add(MAX_DAYS_AHEAD, "day"))) {
        context.addIssue({
          code: "custom",
          path: ["departure"],
          message: `Departure can be at most ${MAX_DAYS_AHEAD} days ahead`,
        });
      }
    }
  });

export type TripFormValues = z.input<typeof tripSchema>;
export type ValidTripFormValues = z.output<typeof tripSchema>;
