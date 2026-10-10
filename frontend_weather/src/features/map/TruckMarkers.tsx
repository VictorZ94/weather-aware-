import LocalShippingIcon from '@mui/icons-material/LocalShipping'
import Box from '@mui/material/Box'
import { Marker } from 'react-map-gl/maplibre'
import type { TripPlan } from '../../api/schemas'
import { ROUTE_COLORS } from '../../theme'
import { truckPosition } from '../../utils/truckPosition'

type Props = {
  plan: TripPlan
  hour: number
  selectedRouteId: string | null
  onSelectRoute: (routeId: string) => void
}

export function TruckMarkers({ plan, hour, selectedRouteId, onSelectRoute }: Props) {
  const departureMs = Date.parse(plan.departure_time)
  const atMs = departureMs + hour * 3_600_000

  return plan.routes.map((route) => {
    const position = truckPosition(route, departureMs, atMs)
    if (!position) return null

    const selected = route.id === selectedRouteId
    const color = route.id === plan.recommended_route_id ? ROUTE_COLORS.recommended : ROUTE_COLORS.selected

    return (
      <Marker
        key={route.id}
        longitude={position[0]}
        latitude={position[1]}
        anchor="center"
        style={{ zIndex: selected ? 2 : 1 }}
        onClick={(event) => {
          // Keep the click from also reaching the map underneath.
          event.originalEvent.stopPropagation()
          onSelectRoute(route.id)
        }}
      >
        <Box
          title={`Truck on the ${route.name.toLowerCase()}`}
          sx={{
            display: 'grid',
            placeItems: 'center',
            width: selected ? 34 : 28,
            height: selected ? 34 : 28,
            borderRadius: '50%',
            bgcolor: color,
            color: '#ffffff',
            border: '2px solid #ffffff',
            boxShadow: 2,
            cursor: 'pointer',
          }}
        >
          <LocalShippingIcon sx={{ fontSize: selected ? 20 : 16 }} />
        </Box>
      </Marker>
    )
  })
}
