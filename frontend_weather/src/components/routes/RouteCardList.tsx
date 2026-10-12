// @packages
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";

// @components
import { RouteCard } from "./RouteCard";

// @scripts
import type { TripPlan } from "../../api/schemas";

type Props = {
  plan: TripPlan;
  selectedRouteId: string | null;
  onSelectRoute: (routeId: string) => void;
};

export function RouteCardList({ plan, selectedRouteId, onSelectRoute }: Props) {
  const ranked = [...plan.routes].sort((a, b) => a.rank - b.rank);

  return (
    <Stack spacing={1.5} component="section" aria-label="Routes">
      <Typography variant="h2">
        {plan.origin.label} to {plan.destination.label}
      </Typography>
      {ranked.map((route) => (
        <RouteCard
          key={route.id}
          route={route}
          destinationTimezone={plan.destination.timezone}
          recommended={route.id === plan.recommended_route_id}
          recommendationReason={plan.recommendation_reason}
          selected={route.id === selectedRouteId}
          onSelect={() => onSelectRoute(route.id)}
        />
      ))}
    </Stack>
  );
}
