// @scripts
import { apiFetch } from "./client";
import {
  tripPlanSchema,
  weatherScenariosSchema,
  type TripPlan,
  type TripPlanRequest,
  type WeatherScenario,
} from "./schemas";

export function planTrip(
  request: TripPlanRequest,
  signal?: AbortSignal,
): Promise<TripPlan> {
  return apiFetch("/trips/plan/", tripPlanSchema, {
    method: "POST",
    body: JSON.stringify(request),
    signal,
  });
}

export async function listWeatherScenarios(
  signal?: AbortSignal,
): Promise<WeatherScenario[]> {
  const data = await apiFetch(
    "/trips/weather-scenarios/",
    weatherScenariosSchema,
    { signal },
  );
  return data.scenarios;
}
