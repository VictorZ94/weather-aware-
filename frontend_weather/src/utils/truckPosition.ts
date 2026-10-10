import along from '@turf/along'
import { lineString } from '@turf/helpers'
import type { Route } from '../api/schemas'

// Where the truck is on a route at a given instant, found by interpolating
// between the two checkpoints whose ETAs bracket that instant. Returns null
// once the truck has arrived.
export function truckPosition(
  route: Route,
  departureMs: number,
  atMs: number,
): [number, number] | null {
  const arrivalMs = Date.parse(route.arrival_time)
  if (atMs > arrivalMs) return null

  const stops = [
    { mile: 0, timeMs: departureMs },
    ...route.checkpoints.map((checkpoint) => ({
      mile: checkpoint.mile,
      timeMs: Date.parse(checkpoint.eta),
    })),
    { mile: route.distance_miles, timeMs: arrivalMs },
  ]

  let mile = 0
  for (let i = 1; i < stops.length; i++) {
    const previous = stops[i - 1]
    const next = stops[i]
    if (atMs <= next.timeMs) {
      const span = next.timeMs - previous.timeMs
      const progress = span > 0 ? (atMs - previous.timeMs) / span : 0
      mile = previous.mile + (next.mile - previous.mile) * Math.max(0, progress)
      break
    }
    mile = next.mile
  }

  const point = along(lineString(route.geometry.coordinates), mile, { units: 'miles' })
  const [lon, lat] = point.geometry.coordinates
  return [lon, lat]
}
