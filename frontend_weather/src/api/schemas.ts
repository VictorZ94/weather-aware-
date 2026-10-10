import { z } from 'zod'

// The contract with Django. Types are inferred from these schemas, and every
// response is parsed with them before it reaches a component.

export const RISK_LEVELS = ['low', 'moderate', 'high', 'severe', 'no_travel'] as const
export const riskLevelSchema = z.enum(RISK_LEVELS)
export type RiskLevel = z.infer<typeof riskLevelSchema>

export const placeSchema = z.object({
  id: z.string(),
  label: z.string(),
  lat: z.number(),
  lon: z.number(),
  timezone: z.string(),
})
export type Place = z.infer<typeof placeSchema>

export const suggestResponseSchema = z.object({
  suggestions: z.array(placeSchema),
})

export const weatherSchema = z.object({
  condition: z.string(),
  temperature_c: z.number(),
  wind_speed_mph: z.number(),
  wind_gust_mph: z.number(),
  rain_mm: z.number(),
  snow_cm: z.number(),
  visibility_miles: z.number(),
})
export type Weather = z.infer<typeof weatherSchema>

// weather, risk_level, deciding_condition and load_rule are null together
// when no forecast was available for the checkpoint.
export const checkpointSchema = z.object({
  id: z.string(),
  mile: z.number(),
  lat: z.number(),
  lon: z.number(),
  eta: z.string(),
  timezone: z.string(),
  risk_level: riskLevelSchema.nullable(),
  deciding_condition: z.string().nullable(),
  load_rule: z.string().nullable(),
  weather: weatherSchema.nullable(),
})
export type Checkpoint = z.infer<typeof checkpointSchema>

export const routeSchema = z.object({
  id: z.string(),
  name: z.string(),
  geometry: z.object({
    type: z.literal('LineString'),
    coordinates: z.array(z.tuple([z.number(), z.number()])).min(2),
  }),
  distance_miles: z.number(),
  duration_minutes: z.number(),
  arrival_time: z.string(),
  average_risk: riskLevelSchema,
  miles_by_level: z.object({
    low: z.number(),
    moderate: z.number(),
    high: z.number(),
    severe: z.number(),
    no_travel: z.number(),
  }),
  worst_segment: z
    .object({
      from_mile: z.number(),
      to_mile: z.number(),
      risk_level: riskLevelSchema,
      description: z.string(),
    })
    .nullable(),
  checkpoints: z.array(checkpointSchema),
})
export type Route = z.infer<typeof routeSchema>

export const WARNING_CODES = ['no_travel_all_routes', 'fewer_routes', 'missing_weather'] as const
export const warningSchema = z.object({
  code: z.enum(WARNING_CODES),
  message: z.string(),
})
export type TripWarning = z.infer<typeof warningSchema>

export const heatmapSchema = z.object({
  hours: z.array(
    z.object({
      hour: z.number().int(),
      // [lon, lat, intensity 0..1]
      points: z.array(z.tuple([z.number(), z.number(), z.number()])),
    }),
  ),
})
export type Heatmap = z.infer<typeof heatmapSchema>

export const tripPlanSchema = z.object({
  origin: placeSchema,
  destination: placeSchema,
  departure_time: z.string(),
  checkpoint_interval_miles: z.number(),
  recommended_route_id: z.string().nullable(),
  recommendation_reason: z.string().nullable(),
  warnings: z.array(warningSchema),
  routes: z.array(routeSchema),
  heatmap: heatmapSchema,
})
export type TripPlan = z.infer<typeof tripPlanSchema>

export const CHECKPOINT_INTERVALS = [10, 25, 50] as const
export type CheckpointInterval = (typeof CHECKPOINT_INTERVALS)[number]

export type TripPlanRequest = {
  origin: Place
  destination: Place
  departure_time: string
  load_weight_kg: number
  checkpoint_interval_miles: CheckpointInterval
}

export const apiErrorSchema = z.object({
  detail: z.string(),
  field_errors: z.record(z.string(), z.string()).optional(),
})
