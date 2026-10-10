# Weather-aware truck routing: frontend plan (stage 1)

## Context

A truck driver enters a trip (origin, destination, departure, cargo weight, checkpoint interval) and the app shows 3 candidate routes with weather risk so they can pick the safest one. Django will own all external calls (HERE, Open-Meteo), API keys and risk rules. React only collects input, sends two kinds of request, and draws what comes back.

This stage builds the whole frontend against a fake Django. No real backend, no real data.

Starting point: `frontend_weather/` is an untouched Vite 8 + React 19 + TypeScript 6 template with the React Compiler enabled. Nothing reusable exists yet; the demo `App.tsx`, `App.css`, `index.css` and `src/assets/*` get replaced.

## Decisions

| Topic | Choice |
|---|---|
| Layout | One page. Desktop: left panel (form, then warnings, then route cards) and the map filling the rest, with the forecast slider docked at the bottom of the map. Phones (below `md`): the panel stacks above the map. |
| Fake Django | **Mock Service Worker (MSW)**. React makes real `fetch` calls to `/api/...`; MSW answers them in the browser with a 1.5–3 s delay. The app code is the final code, and connecting Django later is a one-line switch (`VITE_USE_MOCKS=false`). |
| Form | `react-hook-form` with a `zod` schema through `@hookform/resolvers/zod`. MUI inputs are wired with `Controller`. |
| Validation | `zod`, used twice: the form schema, and schemas for Django's responses. The TypeScript types are inferred from the response schemas, so a contract mismatch fails loudly at the API boundary instead of deep in the map. |
| Server calls | TanStack Query (`@tanstack/react-query`) for both requests: loading, error, caching and cancellation. |
| Dates and time zones | Day.js with the `utc` and `timezone` plugins (replaces Moment.js); `@mui/x-date-pickers` `DateTimePicker` with `AdapterDayjs`. Every time is shown in the local zone of the place it refers to, with the zone abbreviation. |
| Checkpoint interval | A form field: 10 / 25 / 50 miles, default 25, sent to Django. Django samples weather at each checkpoint using the truck's ETA there. |
| Units | Cargo weight in lb by default with a lb/kg selector. Distances in miles. Temperature °F/°C switch. Choices saved in `localStorage`. The API always uses kg and °C; conversion is display-only. |
| Risk levels | Five, sent by Django as `low`, `moderate`, `high`, `severe`, `no_travel`. |
| Map | `maplibre-gl` through `react-map-gl/maplibre`, with the OpenFreeMap "liberty" style as the background. |
| Tests | None in this stage. Lint, type-check and manual browser verification. |
| UI language | English. |

### Risk colours (`theme.ts`, single source for map, cards, bar and legend)

| Level | Colour |
|---|---|
| Low | green `#2e7d32` |
| Moderate | yellow `#fbc02d` |
| High | orange `#ef6c00` |
| Severe | red `#d32f2f` |
| No Travel | purple `#4a148c` |

### What MapLibre and OpenFreeMap are for

A web map has two parts, and these are one each:

- **MapLibre** is the map engine. It puts the map on the page, handles pan and zoom, and draws our own data on top: the 3 route lines, the checkpoint dots, the popups, the heatmap and the truck icons. It is open source and needs no account. It has no map imagery of its own.
- **OpenFreeMap** is the background map: the roads, city names, rivers and state borders underneath our data. MapLibre downloads this from a tile server, and most tile servers (MapTiler, Mapbox, HERE) need an API key in the browser. OpenFreeMap is free and needs none, which keeps the "React holds no API keys" rule intact.

The background is a single style URL, so swapping it later (for example to HERE tiles proxied through Django) is a one-line change.

## Packages to add

`@mui/material @emotion/react @emotion/styled @mui/icons-material @mui/x-date-pickers dayjs react-hook-form zod @hookform/resolvers @tanstack/react-query maplibre-gl react-map-gl @turf/along @turf/helpers`, and dev `msw` (plus `npx msw init public/`).

Check current docs with `ctx7` for MUI, react-hook-form, zod, TanStack Query, react-map-gl and MSW before writing against their APIs.

## API contract (what MSW fakes now, what Django implements later)

**1. Suggest places** — `GET /api/places/suggest/?q=<text>`

```json
{ "suggestions": [ { "id": "denver-co", "label": "Denver, CO", "lat": 39.74, "lon": -104.99, "timezone": "America/Denver" } ] }
```

**2. Plan trip** — `POST /api/trips/plan/`

Request:
```json
{ "origin": { "id", "label", "lat", "lon", "timezone" }, "destination": { ... },
  "departure_time": "2026-10-12T06:00:00-06:00",
  "load_weight_kg": 18000, "checkpoint_interval_miles": 25 }
```

Response (everything in one go):
```json
{
  "origin": { "id", "label", "lat", "lon", "timezone" }, "destination": { ... },
  "departure_time": "...",
  "checkpoint_interval_miles": 25,
  "recommended_route_id": "route-b",
  "recommendation_reason": "Avoids the snow band over I-80 between hours 6 and 9",
  "warnings": [ { "code": "no_travel_all_routes | fewer_routes | missing_weather", "message": "..." } ],
  "routes": [ {
    "id": "route-a", "name": "via I-80",
    "geometry": { "type": "LineString", "coordinates": [[lon, lat], ...] },
    "distance_miles": 512, "duration_minutes": 495, "arrival_time": "...",
    "average_risk": "moderate",
    "miles_by_level": { "low": 300, "moderate": 140, "high": 50, "severe": 22, "no_travel": 0 },
    "worst_segment": { "from_mile": 210, "to_mile": 260, "risk_level": "high", "description": "Crosswinds 45 mph" },
    "checkpoints": [ {
      "id": "route-a-cp-8", "mile": 200, "lat": 41.1, "lon": -104.8, "eta": "...", "timezone": "America/Denver",
      "risk_level": "high",
      "deciding_condition": "Wind gusts 48 mph",
      "load_rule": "Light load: gust limit lowered to 40 mph",
      "weather": { "condition": "snow", "temperature_c": -3, "wind_speed_mph": 30, "wind_gust_mph": 48,
                   "rain_mm": 0, "snow_cm": 2.1, "visibility_miles": 0.8 }
    } ]
  } ],
  "heatmap": { "hours": [ { "hour": 0, "points": [[lon, lat, intensity_0_to_1], ...] }, ... up to hour 48 ] }
}
```

`routes` may hold fewer than 3 entries, `weather` may be `null` for a checkpoint (then `risk_level`, `deciding_condition` and `load_rule` are `null` too), `worst_segment` is `null` when the whole route is Low, and `recommended_route_id` may be `null` when every route is No Travel. The UI handles all three.

All times are ISO 8601 with an offset. Each place and checkpoint carries its IANA `timezone` so React can show local time there without guessing.

Errors: `{ "detail": "message", "field_errors": { "origin": "..." } }` with 4xx/5xx.

## Screens and components

| Component | What it shows or does | MUI / map pieces |
|---|---|---|
| `TripForm` | Origin, destination, departure, cargo weight, interval; submits the plan | `TextField`, `DateTimePicker`, `ToggleButtonGroup`, `Button` |
| `PlaceAutocomplete` | Suggestions from Django as the driver types (debounced 300 ms) | `Autocomplete` |
| `WeightField` | Number + unit (lb / kg), labelled "Cargo weight" | `TextField`, `Select` |
| `RouteCard` | Distance, duration, arrival time, miles per level, average risk, worst segment | `Card`, `Chip` |
| `RiskMilesBar` | Coloured bar of miles at each level | `Box` (custom) |
| `RecommendationBadge` | "Recommended" plus the reason from Django | `Chip`, `Tooltip` |
| `WarningBanner` | No Travel on all routes, fewer than 3 routes, missing weather | `Alert` |
| `RouteMap` | Base map; holds the layers below | react-map-gl `Map` |
| `RouteLayers` | 3 lines; recommended thick and coloured, others grey | `Source` + line `Layer` |
| `CheckpointLayer` + `CheckpointPopup` | Dots coloured by level; popup with ETA, wind/rain/snow, deciding condition, load rule applied | circle `Layer`, `Popup` |
| `HeatmapLayer` | Risk for the selected hour | heatmap `Layer` |
| `ForecastSlider` | 0–48 h, labelled with real local times | `Slider` |
| `TruckMarkers` | Where each truck is at the slider time (nice to have) | `Marker` |
| `RiskLegend` | The 5 levels and colours, always visible | `Paper`, `Stack` |

Clicking a route card highlights that route on the map, and clicking a route line selects its card.

## File layout (`frontend_weather/src/`)

```
main.tsx                 providers (QueryClient, Theme, CssBaseline, Localization, Units), starts MSW when VITE_USE_MOCKS=true
App.tsx                  layout shell, owns submitted request + selectedRouteId + selectedHour
theme.ts                 MUI theme + the 5 risk colours and labels
api/      schemas.ts (zod response schemas + inferred types)  client.ts (fetch wrapper, ApiError, AbortSignal)
          places.ts  trips.ts  queryClient.ts
mocks/    browser.ts  handlers.ts  places.ts (~20 US cities)  generateTrip.ts
hooks/    usePlanTrip.ts  usePlaceSuggestions.ts  useDebouncedValue.ts
context/  UnitsContext.tsx
features/
  trip-form/  TripForm.tsx  PlaceAutocomplete.tsx  WeightField.tsx  tripSchema.ts
  routes/     RouteCardList.tsx  RouteCard.tsx  RiskMilesBar.tsx  RecommendationBadge.tsx  WarningBanner.tsx
  map/        RouteMap.tsx  RouteLayers.tsx  CheckpointLayer.tsx  CheckpointPopup.tsx
              HeatmapLayer.tsx  TruckMarkers.tsx  RiskLegend.tsx
  timeline/   ForecastSlider.tsx
components/   LoadingOverlay.tsx  ErrorAlert.tsx  ErrorBoundary.tsx
utils/        dayjs.ts (plugin setup)  format.ts  units.ts  truckPosition.ts
```

Also: `.env.development` (`VITE_USE_MOCKS=true`, `VITE_API_BASE_URL=/api`) and a `/api` proxy to `localhost:8000` in `vite.config.ts`, ready for Django.

## The five jobs

**1. Trip form** (`features/trip-form/`)
- `TripForm`: `useForm` with `zodResolver(tripSchema)`; every MUI input is wrapped in a `Controller`, and `fieldState.error` feeds the input's `error` and `helperText`.
- `PlaceAutocomplete`: the MUI Material `Autocomplete` in its asynchronous mode, used for both origin and destination. `usePlaceSuggestions` is a `useQuery` keyed on the 300 ms debounced text, enabled from 2 characters, with the query's `signal` passed to `fetch` so superseded requests are cancelled, previous options kept while the next ones load, and repeated text served from cache. `filterOptions={(x) => x}` because the server does the matching. Shows "Searching…" and "No places found". It already calls `GET /api/places/suggest/`, so real address suggestions later need no component change.
- `WeightField`: number `TextField` labelled "Cargo weight" with a lb/kg `Select`. Changing the unit converts the typed value.
- Departure `DateTimePicker` (Day.js). The time picked is read as local time at the origin, and the field's helper text says so ("Denver time, MDT"). Interval `ToggleButtonGroup` 10 / 25 / 50 mi, default 25.
- `tripSchema.ts` (zod): origin and destination must be an option picked from the suggestions (typed text alone is not enough) and must differ, departure is required and not in the past, weight is a number greater than 0, interval is one of 10/25/50. Errors show under each field on submit, then re-validate as the field changes.
- Submit converts weight to kg, builds the departure as ISO in the origin's zone with `dayjs.tz`, and hands the request to `App`.

**2. Loading and error states**
- `usePlanTrip(request)`: a `useQuery` keyed on the submitted request, disabled until the first submit, no automatic retries, no refetch on window focus, previous data kept as placeholder. A query (not a mutation) because planning only reads: this gives cancellation of the in-flight request on resubmit, the last good result staying on screen, and an instant answer when the same trip is submitted again within a few minutes. The response is parsed with the zod schema before it reaches any component.
- Loading: button disabled with spinner, plus a translucent overlay with `CircularProgress` and "Checking weather along your routes…" over the map.
- Error: MUI `Alert` with the server's `detail` (or a friendly network, timeout or "unexpected response" message) and a Retry button wired to `refetch`. Server `field_errors` map back onto the form fields with `setError`. The previous successful result stays on screen.
- `WarningBanner` is separate from errors: the request succeeded but Django flagged something (`warnings[]`). One `Alert` per warning, `error` severity for No Travel on all routes, `warning` for the other two.
- `ErrorBoundary` around the map so a render failure shows a message, not a blank page.
- Idle: map centred on the US with a short "Plan a trip to see routes" hint.

**3. Map** (`features/map/`)
- `RouteLayers`: one GeoJSON source, up to three lines. Recommended route is thick and blue with a white casing; the others are thinner grey. The selected route gets a darker outline and is drawn on top. Map fits to the route bounds when a result arrives.
- `CheckpointLayer`: a circle layer for the selected route, coloured by `risk_level` with a `match` expression; checkpoints with no weather are grey and hollow. One layer scales to hundreds of dots, unlike DOM markers.
- `CheckpointPopup`: on click, shows mile, ETA in the checkpoint's own zone (`2:40 PM CDT`), wind and gusts, rain, snow, temperature, visibility, the deciding condition and the load rule applied. Shows "Weather unavailable" when `weather` is null.
- `RiskLegend`: the 5 levels, always visible in a map corner, with "Weather sampled every 25 mi".

**4. Route summary cards** (`features/routes/`)
- `RouteCard`: name, distance, duration (`8 h 15 min`), arrival time in the destination's zone, average-risk `Chip` in the risk colour, `RiskMilesBar`, and the worst segment line (`Worst: mi 210–260, crosswinds 45 mph`).
- `RiskMilesBar`: a stacked horizontal bar, one segment per level sized by `miles_by_level`, with the miles on hover and as text for accessibility.
- `RecommendationBadge` on the recommended card: "Recommended" chip with the reason in a tooltip and as a line of text under it (tooltips do not work on touch).
- Selected card is outlined and scrolled into view when a line is clicked on the map.

**5. Heatmap and slider** (`features/timeline/`, `HeatmapLayer`, `TruckMarkers`)
- All hours go into a single GeoJSON source once, each point tagged with its `hour`. The heatmap layer has a filter `hour == selectedHour`. Moving the slider only changes that filter, so switching is instant with no re-upload of data. The heatmap colour ramp runs through the same five risk colours.
- `ForecastSlider`: MUI `Slider` 0–48, step 1, value label shows the real time in the origin's zone (`+6 h · Mon 12:00 PM MDT`), marks every 6 h.
- `TruckMarkers` (toggle, off by default): one truck marker per route at the position for the selected hour. `truckPosition.ts` interpolates the mile between the two checkpoints whose ETAs bracket the time, then `@turf/along` places it on the line. Hidden once the truck has arrived.

## What React does not do

No HERE or Open-Meteo calls, no API keys, no risk rules. React maps a level to a colour and a label and nothing else; `average_risk`, `miles_by_level`, `deciding_condition`, `load_rule` and `warnings` all arrive computed. The mock generator in `src/mocks/` invents them because it is standing in for Django; app code never imports from it apart from the dev-only start in `main.tsx`.

## Mock behaviour (`src/mocks/`)

- Suggestions: filter the city list by the query, 200–400 ms delay.
- Plan trip: three curved lines between the two cities with different bulges, checkpoints at the requested interval, ETAs from a speed that drops slightly with load, and a storm cell that drifts across the map over the 48 hours so the heatmap and checkpoint risks visibly change and agree with each other. Deterministic per origin/destination pair.
- Special destinations in the city list to reach every state:
  - "Errorville, XX" returns 500.
  - "Blizzard Pass, WY" puts No Travel on all routes (no recommendation, error banner).
  - "Two Roads, NE" returns only 2 routes with the `fewer_routes` warning.
  - "Deadzone, NV" returns some checkpoints with `weather: null` and the `missing_weather` warning.
- `?mockDelay=10000` in the page URL slows the response.

## Build order

1. Install packages, `msw init`, remove template demo files, theme and providers, layout shell.
2. `api/schemas.ts`, client, both API functions, query client; MSW handlers and generator.
3. Trip form with react-hook-form, zod schema, `PlaceAutocomplete` and `WeightField`.
4. `usePlanTrip` query, loading overlay, error alert, error boundary.
5. `RouteMap` with route lines and fit-bounds; then checkpoints, popup and legend.
6. Route cards, miles bar, recommendation badge, warning banner, card/line selection sync.
7. Heatmap, forecast slider, truck markers.
8. Unit switches, phone layout, polish pass.

## Verification

- `npm run lint` and `npm run build` (type-check) pass in `frontend_weather/`.
- `npm run dev`, then in the browser:
  - Typing "den" in Origin shows suggestions after a short pause; the Network tab shows `GET /api/places/suggest/`.
  - Submitting empty, with weight `-5`, or with origin equal to destination shows field errors and sends no request.
  - A valid trip shows the spinner, then 3 lines (one highlighted), 3 cards (one "Recommended" with a reason), coloured checkpoints, and a popup on click with the deciding condition and load rule.
  - Clicking a card highlights its line; clicking a line selects its card.
  - Each card's miles bar adds up to the route distance and uses the legend colours.
  - Dragging the slider across 0–48 changes the heatmap with no lag and no network request; trucks move when the toggle is on.
  - The four special destinations show, in turn: the error alert with Retry, the No Travel banner with no recommendation, the fewer-routes warning with 2 cards, and the missing-weather warning with grey checkpoints.
  - A trip that crosses a zone (Denver to Chicago) shows departure in MDT and arrival in CDT, and checkpoint ETAs switch zone along the way.
  - Submitting the same trip twice in a row returns instantly from cache; a different trip keeps the old result visible under the spinner.
  - lb/kg and °F/°C change the display and survive a reload; the request body is always in kg.
  - Below 900 px wide the panel stacks above the map and everything stays usable.

## Changes made while building

- React Query devtools were dropped: the floating button covered the route cards and the slider.
- MapLibre 6 could not find its worker once Vite bundled it, so `src/features/map/maplibreWorker.ts` points it at a Vite-built one.
- The plan response echoes `origin` and `destination`, and the nullable fields noted above were added. `src/api/schemas.ts` is the source of truth for the contract.
- MSW 3 is started with `setupWorker` from `msw/browser` and `public/mockServiceWorker.js`.
