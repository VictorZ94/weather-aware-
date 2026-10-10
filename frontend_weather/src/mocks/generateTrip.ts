// Stand-in for Django. Everything here (routing, weather, risk rules, the
// recommendation) is invented so the frontend has realistic data to draw.
// App code must never import from this file.

import {
  RISK_LEVELS,
  type Checkpoint,
  type Heatmap,
  type RiskLevel,
  type Route,
  type TripPlan,
  type TripPlanRequest,
  type TripWarning,
  type Weather,
} from '../api/schemas'
import { dayjs } from '../utils/dayjs'
import { SCENARIO } from './places'

type LonLat = [number, number]
type CellKind = 'snow' | 'rain' | 'wind'

// A weather system: a blob that drifts across the map over the 48 hours.
type Cell = {
  kind: CellKind
  lon: number
  lat: number
  atHour: number
  driftLon: number
  driftLat: number
  radius: number
  peak: number
}

const EARTH_RADIUS_MILES = 3958.8
const FORECAST_HOURS = 48
const LIGHT_LOAD_KG = 9_000
const HEAVY_LOAD_KG = 30_000

const round = (value: number, digits = 1) => {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function hashString(text: string): number {
  let hash = 2166136261
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function seededRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function haversineMiles(a: LonLat, b: LonLat): number {
  const toRad = Math.PI / 180
  const dLat = (b[1] - a[1]) * toRad
  const dLon = (b[0] - a[0]) * toRad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[1] * toRad) * Math.cos(b[1] * toRad) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(h))
}

// A curved line from origin to destination. `bulge` pushes the middle of the
// line sideways; a little wiggle makes it look less like a drawn arc.
function buildLine(origin: LonLat, destination: LonLat, bulge: number, wiggles: number): LonLat[] {
  const dx = destination[0] - origin[0]
  const dy = destination[1] - origin[1]
  const control: LonLat = [
    (origin[0] + destination[0]) / 2 - dy * bulge * 2,
    (origin[1] + destination[1]) / 2 + dx * bulge * 2,
  ]
  const points: LonLat[] = []
  const steps = 96
  for (let i = 0; i <= steps; i++) {
    const t = i / steps
    const a = (1 - t) ** 2
    const b = 2 * (1 - t) * t
    const c = t ** 2
    const wiggle = Math.sin(t * Math.PI * wiggles) * 0.008
    points.push([
      round(a * origin[0] + b * control[0] + c * destination[0] - dy * wiggle, 4),
      round(a * origin[1] + b * control[1] + c * destination[1] + dx * wiggle, 4),
    ])
  }
  return points
}

function cumulativeMiles(line: LonLat[]): number[] {
  const miles = [0]
  for (let i = 1; i < line.length; i++) {
    miles.push(miles[i - 1] + haversineMiles(line[i - 1], line[i]))
  }
  return miles
}

function pointAtMile(line: LonLat[], miles: number[], mile: number): LonLat {
  for (let i = 1; i < line.length; i++) {
    if (mile <= miles[i]) {
      const span = miles[i] - miles[i - 1]
      const t = span > 0 ? (mile - miles[i - 1]) / span : 0
      return [
        line[i - 1][0] + (line[i][0] - line[i - 1][0]) * t,
        line[i - 1][1] + (line[i][1] - line[i - 1][1]) * t,
      ]
    }
  }
  return line[line.length - 1]
}

function timezoneForLongitude(lon: number): string {
  if (lon > -85.5) return 'America/New_York'
  if (lon > -101.5) return 'America/Chicago'
  if (lon > -114) return 'America/Denver'
  return 'America/Los_Angeles'
}

function strongestCell(cells: Cell[], lon: number, lat: number, hour: number) {
  let intensity = 0
  let kind: CellKind = 'wind'
  for (const cell of cells) {
    const elapsed = hour - cell.atHour
    const dx = (lon - (cell.lon + cell.driftLon * elapsed)) * Math.cos((lat * Math.PI) / 180)
    const dy = lat - (cell.lat + cell.driftLat * elapsed)
    const value = cell.peak * Math.exp(-(dx * dx + dy * dy) / (2 * cell.radius * cell.radius))
    if (value > intensity) {
      intensity = value
      kind = cell.kind
    }
  }
  return { intensity, kind }
}

function weatherAt(cells: Cell[], lon: number, lat: number, hour: number): Weather {
  const { intensity: i, kind } = strongestCell(cells, lon, lat, hour)
  const gust = kind === 'wind' ? 14 + 52 * i : 12 + 22 * i
  const snowing = kind === 'snow' && i > 0.25
  const raining = kind === 'rain' && i > 0.2

  let condition = 'Clear'
  if (i >= 0.12) condition = 'Cloudy'
  if (snowing) condition = i > 0.7 ? 'Heavy snow' : 'Snow'
  else if (raining) condition = i > 0.7 ? 'Heavy rain' : 'Rain'
  else if (kind === 'wind' && i > 0.35) condition = 'Strong wind'

  return {
    condition,
    temperature_c: round(kind === 'snow' ? 4 - 12 * i : kind === 'rain' ? 14 - 4 * i : 16 - 3 * i),
    wind_speed_mph: round(gust * 0.6, 0),
    wind_gust_mph: round(gust, 0),
    rain_mm: raining ? round(13 * i * i) : 0,
    snow_cm: snowing ? round(3.5 * i * i) : 0,
    visibility_miles:
      snowing || raining ? round(Math.max(0.1, 10 - 10.5 * i), 1) : round(10 - 2 * i, 1),
  }
}

// The risk rules. In the real system these live in Django only.
function classify(weather: Weather, loadKg: number) {
  const light = loadKg < LIGHT_LOAD_KG
  const heavy = loadKg > HEAVY_LOAD_KG
  const gustShift = light ? -10 : 0

  const gust = weather.wind_gust_mph
  const gustLevel =
    gust < 25 + gustShift ? 0 : gust < 35 + gustShift ? 1 : gust < 45 + gustShift ? 2 : gust < 55 + gustShift ? 3 : 4

  const snow = weather.snow_cm
  let snowLevel = snow === 0 ? 0 : snow < 0.5 ? 1 : snow < 1.5 ? 2 : snow < 2.8 ? 3 : 4
  if (heavy && snowLevel > 0 && snowLevel < 4) snowLevel += 1

  const rain = weather.rain_mm
  const rainLevel = rain < 2 ? 0 : rain < 6 ? 1 : rain < 10 ? 2 : 3

  const visibility = weather.visibility_miles
  const visibilityLevel =
    visibility >= 3 ? 0 : visibility >= 1 ? 1 : visibility >= 0.5 ? 2 : visibility >= 0.25 ? 3 : 4

  const factors = [
    { level: snowLevel, text: `Snow ${snow} cm/h` },
    { level: gustLevel, text: `Wind gusts ${gust} mph` },
    { level: visibilityLevel, text: `Visibility ${visibility} mi` },
    { level: rainLevel, text: `Rain ${rain} mm/h` },
  ]
  const deciding = factors.reduce((worst, factor) => (factor.level > worst.level ? factor : worst))

  return {
    level: RISK_LEVELS[deciding.level],
    deciding: deciding.level === 0 ? 'No significant weather' : deciding.text,
    loadRule: light
      ? 'Light load: gust limits lowered by 10 mph'
      : heavy
        ? 'Heavy load: snow risk raised one level'
        : 'Standard load: no adjustment',
  }
}

function routeName(bulge: number, dx: number, dy: number): string {
  if (Math.abs(bulge) < 0.05) return 'Direct route'
  // The bulge moves the line by (-dy, dx) * bulge.
  const mostlyEastWest = Math.abs(dx) >= Math.abs(dy)
  if (mostlyEastWest) return dx * bulge > 0 ? 'Northern route' : 'Southern route'
  return -dy * bulge > 0 ? 'Eastern route' : 'Western route'
}

function buildRoute(
  index: number,
  bulge: number,
  request: TripPlanRequest,
  cells: Cell[],
  speedMph: number,
  dropWeather: boolean,
): Route {
  const origin: LonLat = [request.origin.lon, request.origin.lat]
  const destination: LonLat = [request.destination.lon, request.destination.lat]
  const line = buildLine(origin, destination, bulge, 3 + index)
  const miles = cumulativeMiles(line)
  const distance = miles[miles.length - 1]
  const interval = request.checkpoint_interval_miles
  const departure = dayjs(request.departure_time)
  const id = `route-${'abc'[index]}`

  const checkpointMiles: number[] = []
  for (let mile = 0; mile < distance - interval * 0.3; mile += interval) checkpointMiles.push(mile)
  checkpointMiles.push(distance)

  const checkpoints: Checkpoint[] = checkpointMiles.map((mile, i) => {
    const [lon, lat] = pointAtMile(line, miles, mile)
    const hour = mile / speedMph
    const timezone = timezoneForLongitude(lon)
    const base = {
      id: `${id}-cp-${i}`,
      mile: round(mile),
      lat: round(lat, 4),
      lon: round(lon, 4),
      eta: departure.add(hour * 60, 'minute').tz(timezone).format(),
      timezone,
    }
    if (dropWeather && i % 4 === 2) {
      return { ...base, risk_level: null, deciding_condition: null, load_rule: null, weather: null }
    }
    const weather = weatherAt(cells, lon, lat, hour)
    const risk = classify(weather, request.load_weight_kg)
    return {
      ...base,
      risk_level: risk.level,
      deciding_condition: risk.deciding,
      load_rule: risk.loadRule,
      weather,
    }
  })

  // Each checkpoint stands for the stretch of road up to the next one.
  const milesByLevel = { low: 0, moderate: 0, high: 0, severe: 0, no_travel: 0 }
  let weightedLevels = 0
  let knownMiles = 0
  checkpoints.forEach((checkpoint, i) => {
    const next = checkpoints[i + 1]
    if (!next || checkpoint.risk_level === null) return
    const stretch = next.mile - checkpoint.mile
    milesByLevel[checkpoint.risk_level] += stretch
    weightedLevels += RISK_LEVELS.indexOf(checkpoint.risk_level) * stretch
    knownMiles += stretch
  })
  for (const level of RISK_LEVELS) milesByLevel[level] = round(milesByLevel[level])

  const hasNoTravel = checkpoints.some((checkpoint) => checkpoint.risk_level === 'no_travel')
  const averageRisk: RiskLevel = hasNoTravel
    ? 'no_travel'
    : RISK_LEVELS[Math.round(knownMiles > 0 ? weightedLevels / knownMiles : 0)]

  const duration = (distance / speedMph) * 60

  return {
    id,
    name: routeName(bulge, destination[0] - origin[0], destination[1] - origin[1]),
    geometry: { type: 'LineString', coordinates: line },
    distance_miles: round(distance),
    duration_minutes: Math.round(duration),
    arrival_time: departure.add(duration, 'minute').tz(request.destination.timezone).format(),
    average_risk: averageRisk,
    miles_by_level: milesByLevel,
    worst_segment: findWorstSegment(checkpoints),
    checkpoints,
  }
}

function findWorstSegment(checkpoints: Checkpoint[]): Route['worst_segment'] {
  const levelOf = (checkpoint: Checkpoint) =>
    checkpoint.risk_level === null ? -1 : RISK_LEVELS.indexOf(checkpoint.risk_level)
  const worst = Math.max(...checkpoints.map(levelOf))
  if (worst <= 0) return null

  // Longest unbroken run of checkpoints at the worst level.
  let best = { start: 0, end: 0, length: 0 }
  let start = -1
  checkpoints.forEach((checkpoint, i) => {
    if (levelOf(checkpoint) === worst) {
      if (start === -1) start = i
      if (i - start + 1 > best.length) best = { start, end: i, length: i - start + 1 }
    } else {
      start = -1
    }
  })

  const after = checkpoints[best.end + 1] ?? checkpoints[best.end]
  return {
    from_mile: checkpoints[best.start].mile,
    to_mile: after.mile,
    risk_level: RISK_LEVELS[worst],
    description: checkpoints[best.start].deciding_condition ?? '',
  }
}

function exposure(route: Route): number {
  const weighted = RISK_LEVELS.reduce(
    (sum, level, index) => sum + route.miles_by_level[level] * index,
    0,
  )
  return weighted / route.distance_miles + (route.duration_minutes / 60) * 0.02
}

const riskyMiles = (route: Route) =>
  route.miles_by_level.high + route.miles_by_level.severe + route.miles_by_level.no_travel

function recommend(routes: Route[]): { id: string | null; reason: string | null } {
  const drivable = routes.filter((route) => route.average_risk !== 'no_travel')
  if (drivable.length === 0) return { id: null, reason: null }

  const ranked = [...drivable].sort((a, b) => exposure(a) - exposure(b))
  const best = ranked[0]
  const others = routes.filter((route) => route.id !== best.id)
  if (others.length === 0) return { id: best.id, reason: 'The only route available for this trip.' }

  const fastestOther = [...others].sort((a, b) => a.duration_minutes - b.duration_minutes)[0]
  const saved = Math.round(riskyMiles(fastestOther) - riskyMiles(best))
  const extra = best.duration_minutes - fastestOther.duration_minutes

  let reason: string
  if (extra <= 0 && saved > 0) {
    reason = `Fastest route, with ${saved} fewer miles at High risk or above than the ${fastestOther.name.toLowerCase()}.`
  } else if (extra <= 0) {
    reason = 'Fastest route, with weather risk no worse than the others.'
  } else if (saved > 0) {
    reason = `${saved} fewer miles at High risk or above than the ${fastestOther.name.toLowerCase()}, for ${extra} min more driving.`
  } else {
    reason = 'Lowest overall weather exposure along the way.'
  }
  return { id: best.id, reason }
}

function buildHeatmap(cells: Cell[], routes: Route[]): Heatmap {
  let west = Infinity
  let east = -Infinity
  let south = Infinity
  let north = -Infinity
  for (const route of routes) {
    for (const [lon, lat] of route.geometry.coordinates) {
      west = Math.min(west, lon)
      east = Math.max(east, lon)
      south = Math.min(south, lat)
      north = Math.max(north, lat)
    }
  }
  const pad = 2.5
  const step = east - west > 20 ? 0.5 : 0.3

  const hours: Heatmap['hours'] = []
  for (let hour = 0; hour <= FORECAST_HOURS; hour++) {
    const points: [number, number, number][] = []
    for (let lon = west - pad; lon <= east + pad; lon += step) {
      for (let lat = south - pad; lat <= north + pad; lat += step) {
        const { intensity } = strongestCell(cells, lon, lat, hour)
        if (intensity >= 0.1) points.push([round(lon, 2), round(lat, 2), round(Math.min(1, intensity), 2)])
      }
    }
    hours.push({ hour, points })
  }
  return { hours }
}

export function generateTrip(request: TripPlanRequest): TripPlan {
  const scenario = request.destination.id
  const random = seededRandom(hashString(`${request.origin.id}>${request.destination.id}`))

  const origin: LonLat = [request.origin.lon, request.origin.lat]
  const destination: LonLat = [request.destination.lon, request.destination.lat]
  const dx = destination[0] - origin[0]
  const dy = destination[1] - origin[1]
  const spanDegrees = Math.hypot(dx, dy)
  const middle: LonLat = [(origin[0] + destination[0]) / 2, (origin[1] + destination[1]) / 2]

  // A heavier truck is a little slower.
  const speedMph = 58 - Math.min(8, request.load_weight_kg / 5000)
  const directHours = haversineMiles(origin, destination) / speedMph

  const kinds: CellKind[] = ['snow', 'rain', 'wind']
  const firstKind = kinds[Math.floor(random() * 3)]
  const secondKind = kinds[(kinds.indexOf(firstKind) + 1 + Math.floor(random() * 2)) % 3]
  const radius = Math.min(2.2, Math.max(0.8, spanDegrees * 0.07))

  const bulges = scenario === SCENARIO.fewerRoutes ? [0.15, -0.13] : [0.15, 0.02, -0.13]

  const cells: Cell[] = [
    // Sits on the first route's midpoint just as that truck gets there.
    {
      kind: firstKind,
      lon: middle[0] - dy * bulges[0],
      lat: middle[1] + dx * bulges[0],
      atHour: Math.min(directHours / 2, 24),
      driftLon: 0.2,
      driftLat: 0.05,
      radius,
      peak: 0.6 + random() * 0.25,
    },
    // A weaker system that catches the last route late in the trip.
    {
      kind: secondKind,
      lon: origin[0] + dx * 0.78 - dy * bulges[bulges.length - 1] * 0.7,
      lat: origin[1] + dy * 0.78 + dx * bulges[bulges.length - 1] * 0.7,
      atHour: Math.min(directHours * 0.8, 36),
      driftLon: 0.12,
      driftLat: -0.04,
      radius: radius * 0.8,
      peak: 0.4 + random() * 0.25,
    },
  ]
  if (scenario === SCENARIO.noTravel) {
    cells.push({
      kind: 'snow',
      lon: destination[0],
      lat: destination[1],
      atHour: 0,
      driftLon: 0,
      driftLat: 0,
      radius: 3,
      peak: 1.2,
    })
  }

  const routes = bulges.map((bulge, index) =>
    buildRoute(index, bulge, request, cells, speedMph, scenario === SCENARIO.missingWeather),
  )
  const recommendation = recommend(routes)

  const warnings: TripWarning[] = []
  if (recommendation.id === null) {
    warnings.push({
      code: 'no_travel_all_routes',
      message: 'Every route crosses conditions rated No Travel. Consider delaying departure.',
    })
  }
  if (routes.length < 3) {
    warnings.push({
      code: 'fewer_routes',
      message: `Only ${routes.length} distinct routes were found for this trip.`,
    })
  }
  const missing = routes.reduce(
    (count, route) => count + route.checkpoints.filter((checkpoint) => checkpoint.weather === null).length,
    0,
  )
  if (missing > 0) {
    warnings.push({
      code: 'missing_weather',
      message: `No forecast was available for ${missing} checkpoints. Risk there is unknown.`,
    })
  }

  return {
    origin: request.origin,
    destination: request.destination,
    departure_time: request.departure_time,
    checkpoint_interval_miles: request.checkpoint_interval_miles,
    recommended_route_id: recommendation.id,
    recommendation_reason: recommendation.reason,
    warnings,
    routes,
    heatmap: buildHeatmap(cells, routes),
  }
}
