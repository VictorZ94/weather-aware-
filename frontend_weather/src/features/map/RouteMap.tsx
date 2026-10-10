import 'maplibre-gl/dist/maplibre-gl.css'
import './maplibreWorker'
import { useEffect, useRef, useState } from 'react'
import {
  Map,
  Marker,
  NavigationControl,
  type MapLayerMouseEvent,
  type MapRef,
} from 'react-map-gl/maplibre'
import type { TripPlan } from '../../api/schemas'
import { CHECKPOINT_LAYER_ID, CheckpointLayer } from './CheckpointLayer'
import { CheckpointPopup } from './CheckpointPopup'
import { HeatmapLayer } from './HeatmapLayer'
import { RiskLegend } from './RiskLegend'
import { ROUTE_HIT_LAYER_ID, RouteLayers } from './RouteLayers'
import { TruckMarkers } from './TruckMarkers'

// Free base map, no API key.
const MAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'
const USA_VIEW = { longitude: -98.5, latitude: 39.5, zoom: 3.6 }

type Props = {
  plan: TripPlan | null
  selectedRouteId: string | null
  onSelectRoute: (routeId: string) => void
  hour: number
  showTrucks: boolean
}

export function RouteMap({ plan, selectedRouteId, onSelectRoute, hour, showTrucks }: Props) {
  const mapRef = useRef<MapRef>(null)
  const [loaded, setLoaded] = useState(false)
  const [cursor, setCursor] = useState('')
  const [popupCheckpointId, setPopupCheckpointId] = useState<string | null>(null)

  const selectedRoute = plan?.routes.find((route) => route.id === selectedRouteId) ?? null
  // Looked up on the selected route, so the popup closes when the route changes.
  const popupCheckpoint =
    selectedRoute?.checkpoints.find((checkpoint) => checkpoint.id === popupCheckpointId) ?? null

  // Frame all routes when a new plan arrives.
  useEffect(() => {
    if (!plan || !loaded) return
    let west = Infinity
    let east = -Infinity
    let south = Infinity
    let north = -Infinity
    for (const route of plan.routes) {
      for (const [lon, lat] of route.geometry.coordinates) {
        west = Math.min(west, lon)
        east = Math.max(east, lon)
        south = Math.min(south, lat)
        north = Math.max(north, lat)
      }
    }
    mapRef.current?.fitBounds(
      [
        [west, south],
        [east, north],
      ],
      { padding: { top: 60, bottom: 60, left: 60, right: 60 }, duration: 800 },
    )
  }, [plan, loaded])

  const handleClick = (event: MapLayerMouseEvent) => {
    const feature = event.features?.[0]
    if (!feature) {
      setPopupCheckpointId(null)
    } else if (feature.layer.id === CHECKPOINT_LAYER_ID) {
      setPopupCheckpointId(feature.properties.id)
    } else if (feature.layer.id === ROUTE_HIT_LAYER_ID) {
      onSelectRoute(feature.properties.id)
    }
  }

  return (
    <>
      <Map
        ref={mapRef}
        initialViewState={USA_VIEW}
        mapStyle={MAP_STYLE}
        style={{ position: 'absolute', inset: 0 }}
        cursor={cursor}
        interactiveLayerIds={plan ? [ROUTE_HIT_LAYER_ID, CHECKPOINT_LAYER_ID] : []}
        onLoad={() => setLoaded(true)}
        onClick={handleClick}
        onMouseEnter={() => setCursor('pointer')}
        onMouseLeave={() => setCursor('')}
      >
        <NavigationControl position="top-right" showCompass={false} />

        {plan && (
          <>
            <HeatmapLayer heatmap={plan.heatmap} hour={hour} />
            <RouteLayers
              routes={plan.routes}
              recommendedRouteId={plan.recommended_route_id}
              selectedRouteId={selectedRouteId}
            />
            {selectedRoute && <CheckpointLayer route={selectedRoute} />}

            <Marker longitude={plan.origin.lon} latitude={plan.origin.lat} anchor="bottom" color="#37474f" />
            <Marker
              longitude={plan.destination.lon}
              latitude={plan.destination.lat}
              anchor="bottom"
              color="#c62828"
            />

            {showTrucks && (
              <TruckMarkers
                plan={plan}
                hour={hour}
                selectedRouteId={selectedRouteId}
                onSelectRoute={onSelectRoute}
              />
            )}
            {popupCheckpoint && (
              <CheckpointPopup
                key={popupCheckpoint.id}
                checkpoint={popupCheckpoint}
                onClose={() => setPopupCheckpointId(null)}
              />
            )}
          </>
        )}
      </Map>
      <RiskLegend intervalMiles={plan?.checkpoint_interval_miles ?? null} />
    </>
  )
}
