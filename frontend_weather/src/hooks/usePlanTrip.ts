import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { ApiError } from '../api/client'
import type { TripPlan, TripPlanRequest } from '../api/schemas'
import { planTrip } from '../api/trips'

// Planning only reads, so it is a query keyed on the submitted request:
// resubmitting cancels the request in flight, and the same trip submitted
// again within a few minutes is answered from cache.
export function usePlanTrip() {
  const [request, setRequest] = useState<TripPlanRequest | null>(null)

  const query = useQuery({
    queryKey: ['trips', 'plan', request],
    queryFn: ({ signal }) => planTrip(request!, signal),
    enabled: request !== null,
  })

  // Keep the last good plan on screen while a new one loads or fails.
  const [plan, setPlan] = useState<TripPlan | null>(null)
  if (query.data && query.data !== plan) setPlan(query.data)

  const error = query.error
    ? query.error instanceof ApiError
      ? query.error
      : new ApiError('Something went wrong while planning the trip.', null)
    : null

  const retry = () => void query.refetch()

  const submit = (next: TripPlanRequest) => {
    const unchanged = request !== null && JSON.stringify(next) === JSON.stringify(request)
    // Same trip again: only worth asking the server if the last try failed.
    if (unchanged) {
      if (query.isError) retry()
    } else {
      setRequest(next)
    }
  }

  return { plan, isLoading: query.isFetching, error, submit, retry }
}
