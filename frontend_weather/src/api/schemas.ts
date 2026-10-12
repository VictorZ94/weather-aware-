// @packages
import { z } from "zod";

// The contract with Django. Types are inferred from these schemas, and every
// response is parsed with them before it reaches a component.

export const RISK_LEVELS = [
  "low",
  "moderate",
  "high",
  "severe",
  "no_travel",
] as const;
export const riskLevelSchema = z.enum(RISK_LEVELS);
export type RiskLevel = z.infer<typeof riskLevelSchema>;

export const placeSchema = z.object({
  id: z.string(),
  label: z.string(),
  lat: z.number(),
  lon: z.number(),
  timezone: z.string(),
});
export type Place = z.infer<typeof placeSchema>;

export const suggestResponseSchema = z.object({
  suggestions: z.array(placeSchema),
});

// What the risk rules use.
export const weatherSchema = z.object({
  wind_gust_mph: z.number(),
  wind_speed_mph: z.number(),
  rain_in: z.number(),
  snow_in: z.number(),
});
export type Weather = z.infer<typeof weatherSchema>;

// weather, risk_level, levels and deciding_condition are null together when
// no forecast was available for the checkpoint (data_status "missing").
// load_rule is the text of the load rule that applied, or null if none did.
export const checkpointSchema = z.object({
  id: z.string(),
  seq: z.number().int(),
  mile: z.number(),
  lat: z.number(),
  lon: z.number(),
  eta: z.string(),
  timezone: z.string(),
  // Miles of road this checkpoint stands for (half way to each neighbour).
  miles_represented: z.number(),
  risk_level: riskLevelSchema.nullable(),
  levels: z
    .object({
      wind: riskLevelSchema,
      rain: riskLevelSchema,
      snow: riskLevelSchema,
    })
    .nullable(),
  deciding_condition: z.string().nullable(),
  load_rule: z.string().nullable(),
  data_status: z.enum(["ok", "missing"]),
  weather: weatherSchema.nullable(),
});
export type Checkpoint = z.infer<typeof checkpointSchema>;

export const routeSchema = z.object({
  id: z.string(),
  name: z.string(),
  geometry: z.object({
    type: z.literal("LineString"),
    coordinates: z.array(z.tuple([z.number(), z.number()])).min(2),
  }),
  distance_miles: z.number(),
  duration_minutes: z.number(),
  arrival_time: z.string(),
  // 1 is the best route.
  rank: z.number().int(),
  // Mile-weighted mean of the levels, 0 (Low) to 4 (No Travel); null when no
  // forecast was available.
  average_risk: z.number().nullable(),
  miles_by_level: z.object({
    low: z.number(),
    moderate: z.number(),
    high: z.number(),
    severe: z.number(),
    no_travel: z.number(),
    unknown: z.number(),
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
});
export type Route = z.infer<typeof routeSchema>;

export const WARNING_CODES = [
  "no_travel_all_routes",
  "fewer_routes",
  "missing_weather",
  "route_notice",
  // Development only: the weather in this plan was made up, not forecast.
  "simulated_weather",
] as const;
export const warningSchema = z.object({
  code: z.enum(WARNING_CODES),
  message: z.string(),
});
export type TripWarning = z.infer<typeof warningSchema>;

// Risk along the trip corridor for hours 0-48. `levels[p][h]` is the level of
// point `p` at `hour0 + h` hours: 0 (Low) to 4 (No Travel), or -1 if unknown.
export const heatmapSchema = z.object({
  hour0: z.string(),
  // [lon, lat]
  points: z.array(z.tuple([z.number(), z.number()])),
  levels: z.array(z.array(z.number().int())),
});
export type Heatmap = z.infer<typeof heatmapSchema>;

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
});
export type TripPlan = z.infer<typeof tripPlanSchema>;

export const CHECKPOINT_INTERVALS = [10, 25, 50] as const;
export type CheckpointInterval = (typeof CHECKPOINT_INTERVALS)[number];

export type TripPlanRequest = {
  origin: Place;
  destination: Place;
  departure_time: string;
  load_weight_kg: number;
  checkpoint_interval_miles: CheckpointInterval;
  // Development only: id of a simulated-weather scenario to use instead of
  // the real forecast. Django rejects it unless it runs with DEBUG on.
  weather_scenario?: string;
};

export const weatherScenariosSchema = z.object({
  scenarios: z.array(
    z.object({ id: z.string(), label: z.string(), description: z.string() }),
  ),
});
export type WeatherScenario = z.infer<
  typeof weatherScenariosSchema
>["scenarios"][number];

export const apiErrorSchema = z.object({
  detail: z.string(),
  field_errors: z.record(z.string(), z.string()).optional(),
  // false when trying again cannot help (bad input, no route).
  retryable: z.boolean().optional(),
});
