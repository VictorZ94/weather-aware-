import { apiFetch } from './client'
import { tripPlanSchema, type TripPlan, type TripPlanRequest } from './schemas'

export function planTrip(request: TripPlanRequest, signal?: AbortSignal): Promise<TripPlan> {
  return apiFetch('/trips/plan/', tripPlanSchema, {
    method: 'POST',
    body: JSON.stringify(request),
    signal,
  })
}
