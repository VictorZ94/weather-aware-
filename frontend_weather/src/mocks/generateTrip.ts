// Stand-in for Django. Everything here (routing, weather, risk rules, the
// recommendation) is invented so the frontend has realistic data to draw.
// App code must never import from this file.

import {
  RISK_LEVELS,
  type Checkpoint,
  type Heatmap,
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
const LB_PER_KG = 2.20462262

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
  return {
    wind_gust_mph: round(gust, 0),
    wind_speed_mph: round(gust * 0.6, 0),
    rain_in: kind === 'rain' && i > 0.2 ? round(1.1 * i * i, 2) : 0,
    snow_in: kind === 'snow' && i > 0.25 ? round(3.2 * i * i, 1) : 0,
  }
}

// How many of the limits a value has reached: 0 (Low) to 4 (No Travel).
const levelFor = (value: number, limits: number[]) => limits.filter((limit) => value >= limit).length

// A rough imitation of the risk and load rules. The real ones live in Django
// (trips/rules.py) and are the only ones that count.
function classify(weather: Weather, loadKg: number) {
  const cargoLb = loadKg * LB_PER_KG
  const gust = weather.wind_gust_mph

  let wind = levelFor(gust, [25, 35, 45, 55])
  let loadRule: string | null = null
  if (gust >= 55) {
    loadRule = 'Wind 55 mph or more: No Travel for any load'
  } else if (gust >= 45 && cargoLb > 30_000) {
    wind = 4
    loadRule = 'Wind 45–54 mph with cargo over 30,000 lb: No Travel'
  } else if (gust >= 35 && cargoLb > 40_000) {
    wind = 3
    loadRule = 'Wind 35–44 mph with cargo over 40,000 lb: Severe'
  }
  const rain = levelFor(weather.rain_in, [0.1, 0.25, 0.5, 1.01])
  const snow = levelFor(weather.snow_in, [0.5, 1, 2, 3.01])
  const level = Math.max(wind, rain, snow)

  let deciding = 'No significant weather'
  if (level > 0) {
    if (wind === level) deciding = `Wind gusts ${gust} mph`
    else if (snow === level) deciding = `Snow ${weather.snow_in.toFixed(1)} in/hr`
    else deciding = `Rain ${weather.rain_in.toFixed(2)} in/hr`
  }

  return {
    level,
    levels: { wind: RISK_LEVELS[wind], rain: RISK_LEVELS[rain], snow: RISK_LEVELS[snow] },
    deciding,
    loadRule,
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
  for (let mile = 0; mile < distance - 1e-6; mile += interval) checkpointMiles.push(mile)
  checkpointMiles.push(distance)

  const checkpoints: Checkpoint[] = checkpointMiles.map((mile, seq) => {
    const [lon, lat] = pointAtMile(line, miles, mile)
    const hour = mile / speedMph
    // Each checkpoint stands for the road half way to each neighbour.
    const back = seq > 0 ? (mile - checkpointMiles[seq - 1]) / 2 : 0
    const ahead = seq + 1 < checkpointMiles.length ? (checkpointMiles[seq + 1] - mile) / 2 : 0
    const base = {
      id: `${id}-cp-${seq}`,
      seq,
      mile: round(mile),
      lat: round(lat, 4),
      lon: round(lon, 4),
      eta: departure.add(hour * 60, 'minute').utc().format(),
      timezone: timezoneForLongitude(lon),
      miles_represented: round(back + ahead, 2),
    }
    if (dropWeather && seq % 4 === 2) {
      return {
        ...base,
        risk_level: null,
        levels: null,
        deciding_condition: null,
        load_rule: null,
        data_status: 'missing',
        weather: null,
      }
    }
    const weather = weatherAt(cells, lon, lat, hour)
    const risk = classify(weather, request.load_weight_kg)
    return {
      ...base,
      risk_level: RISK_LEVELS[risk.level],
      levels: risk.levels,
      deciding_condition: risk.deciding,
      load_rule: risk.loadRule,
      data_status: 'ok',
      weather,
    }
  })

  const milesByLevel = { low: 0, moderate: 0, high: 0, severe: 0, no_travel: 0, unknown: 0 }
  let weightedLevels = 0
  let knownMiles = 0
  for (const checkpoint of checkpoints) {
    milesByLevel[checkpoint.risk_level ?? 'unknown'] += checkpoint.miles_represented
    if (checkpoint.risk_level !== null) {
      weightedLevels += RISK_LEVELS.indexOf(checkpoint.risk_level) * checkpoint.miles_represented
      knownMiles += checkpoint.miles_represented
    }
  }
  for (const key of Object.keys(milesByLevel) as (keyof typeof milesByLevel)[]) {
    milesByLevel[key] = round(milesByLevel[key])
  }

  const duration = (distance / speedMph) * 60

  return {
    id,
    name: routeName(bulge, destination[0] - origin[0], destination[1] - origin[1]),
    geometry: { type: 'LineString', coordinates: line },
    distance_miles: round(distance),
    duration_minutes: Math.round(duration),
    arrival_time: departure.add(duration, 'minute').utc().format(),
    rank: 0, // set by rankRoutes
    average_risk: knownMiles > 0 ? round(weightedLevels / knownMiles, 2) : null,
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

// Orders the routes (fewest Severe miles, fewest High miles, lowest average
// risk, shortest time) and picks the recommended one, like Django's ranking.
function rankRoutes(routes: Route[]) {
  const key = (route: Route) => [
    route.miles_by_level.no_travel > 0 ? 1 : 0,
    route.miles_by_level.no_travel,
    route.miles_by_level.severe,
    route.miles_by_level.high,
    route.average_risk ?? 99,
    route.duration_minutes,
  ]
  routes.sort((a, b) => {
    const [ka, kb] = [key(a), key(b)]
    const i = ka.findIndex((value, n) => value !== kb[n])
    return i === -1 ? 0 : ka[i] - kb[i]
  })
  routes.forEach((route, i) => (route.rank = i + 1))

  const [best, runnerUp] = routes
  const allNoTravel = routes.every((route) => route.miles_by_level.no_travel > 0)
  if (allNoTravel) {
    return {
      id: best.id,
      reason: 'Every route has No Travel conditions; this one has the fewest No Travel miles. Consider a later departure.',
      allNoTravel,
    }
  }

  let reason = 'The only truck route available.'
  if (runnerUp) {
    const mine = best.miles_by_level
    const theirs = runnerUp.miles_by_level
    if (theirs.no_travel > 0) reason = 'The only route without No Travel conditions.'
    else if (mine.severe !== theirs.severe)
      reason = `Fewest Severe miles (${Math.round(mine.severe)} vs ${Math.round(theirs.severe)})`
    else if (mine.high !== theirs.high)
      reason = `Fewest High miles (${Math.round(mine.high)} vs ${Math.round(theirs.high)})`
    else if (best.average_risk !== runnerUp.average_risk)
      reason = `Lowest average risk (${(best.average_risk ?? 0).toFixed(1)} vs ${(runnerUp.average_risk ?? 0).toFixed(1)})`
    else reason = `All routes equally safe; fastest by ${runnerUp.duration_minutes - best.duration_minutes} min`
  }
  return { id: best.id, reason, allNoTravel }
}

function buildHeatmap(cells: Cell[], routes: Route[], request: TripPlanRequest): Heatmap {
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
  const step = east - west > 20 ? 0.4 : 0.25

  const points: [number, number][] = []
  const levels: number[][] = []
  for (let lon = west - pad; lon <= east + pad; lon += step) {
    for (let lat = south - pad; lat <= north + pad; lat += step) {
      const row: number[] = []
      for (let hour = 0; hour <= FORECAST_HOURS; hour++) {
        row.push(classify(weatherAt(cells, lon, lat, hour), request.load_weight_kg).level)
      }
      // The real heatmap only covers the route corridor; here, keep the
      // points where something happens so the weather systems are visible.
      if (row.some((level) => level > 0)) {
        points.push([round(lon, 2), round(lat, 2)])
        levels.push(row)
      }
    }
  }
  return { hour0: dayjs(request.departure_time).utc().startOf('hour').format(), points, levels }
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
  const recommendation = rankRoutes(routes)

  const warnings: TripWarning[] = []
  if (recommendation.allNoTravel) {
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
    heatmap: buildHeatmap(cells, routes, request),
  }
}
