import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import type { TripPlan } from '../../api/schemas'
import { RouteCard } from './RouteCard'

type Props = {
  plan: TripPlan
  selectedRouteId: string | null
  onSelectRoute: (routeId: string) => void
}

export function RouteCardList({ plan, selectedRouteId, onSelectRoute }: Props) {
  // Best route first. Django decides the ranking; this only orders by it.
  const ranked = [...plan.routes].sort((a, b) => a.rank - b.rank)

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
  )
}
