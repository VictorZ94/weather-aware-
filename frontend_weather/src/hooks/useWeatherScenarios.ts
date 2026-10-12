// @packages
import { useQuery } from "@tanstack/react-query";

// @scripts
import { listWeatherScenarios } from "../api/trips";

export function useWeatherScenarios() {
  const query = useQuery({
    queryKey: ["trips", "weather-scenarios"],
    queryFn: ({ signal }) => listWeatherScenarios(signal),
    staleTime: Infinity,
  });
  return query.data ?? [];
}
