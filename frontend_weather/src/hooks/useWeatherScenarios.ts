import { useQuery } from '@tanstack/react-query'
import { listWeatherScenarios } from '../api/trips'

// The simulated-weather choices Django offers. Empty outside development (and
// when the request fails), in which case the selector is not shown at all.
export function useWeatherScenarios() {
  const query = useQuery({
    queryKey: ['trips', 'weather-scenarios'],
    queryFn: ({ signal }) => listWeatherScenarios(signal),
    staleTime: Infinity,
  })
  return query.data ?? []
}
