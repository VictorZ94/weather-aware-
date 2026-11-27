// @scripts
import { apiRequest } from "./client";
import {
  tripPlanSchema,
  type TripPlan,
  type TripPlanRequest,
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
