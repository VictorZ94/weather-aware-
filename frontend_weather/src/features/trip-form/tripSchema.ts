import { z } from 'zod'
import { CHECKPOINT_INTERVALS, placeSchema } from '../../api/schemas'
import { dayjs, wallClockInZone, type Dayjs } from '../../utils/dayjs'

// Fields start empty (null / ''), so the schema accepts those types and
// rejects them with a message instead of a type error.
export const tripSchema = z
  .object({
    origin: placeSchema
      .nullable()
      .refine((place) => place !== null, 'Choose an origin from the suggestions'),
    destination: placeSchema
      .nullable()
      .refine((place) => place !== null, 'Choose a destination from the suggestions'),
    departure: z
      .custom<Dayjs | null>((value) => value === null || dayjs.isDayjs(value))
      .refine((value) => value !== null && value.isValid(), 'Enter a departure date and time'),
    weight: z
      .string()
      .trim()
      .min(1, 'Enter the cargo weight')
      .refine((text) => Number.isFinite(Number(text)), 'Cargo weight must be a number')
      .refine((text) => !(Number(text) <= 0), 'Cargo weight must be greater than 0'),
    interval: z.union(CHECKPOINT_INTERVALS.map((miles) => z.literal(miles))),
    // Development only; '' means the real forecast.
    weatherScenario: z.string(),
  })
  .superRefine((values, context) => {
    const { origin, destination, departure } = values
    if (origin && destination && origin.id === destination.id) {
      context.addIssue({
        code: 'custom',
        path: ['destination'],
        message: 'Destination must be different from the origin',
      })
    }
    // The picked time is local time at the origin.
    if (origin && departure?.isValid()) {
      const departsAt = wallClockInZone(departure, origin.timezone)
      if (departsAt.isBefore(dayjs().subtract(1, 'minute'))) {
        context.addIssue({
          code: 'custom',
          path: ['departure'],
          message: 'Departure cannot be in the past',
        })
      }
    }
  })

// What the fields hold while editing, and what a valid submit hands back.
export type TripFormValues = z.input<typeof tripSchema>
export type ValidTripFormValues = z.output<typeof tripSchema>
