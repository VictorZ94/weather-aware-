// @scripts
import { apiRequest } from "./client";
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
  return apiRequest("/trips/plan/", tripPlanSchema, {
    method: "POST",
    data: request,
    signal,
  });
}

export async function listWeatherScenarios(
  signal?: AbortSignal,
): Promise<WeatherScenario[]> {
  const data = await apiRequest(
    "/trips/weather-scenarios/",
    weatherScenariosSchema,
    { signal },
  );
  return data.scenarios;
}
