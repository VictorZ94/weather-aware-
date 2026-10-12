# Development-only weather simulator

## Context

Open-Meteo usually reports calm weather, so on the real backend every checkpoint is green and the worst cases (No Travel, the load rules, a storm arriving mid-trip, missing forecasts) never appear on screen. The rules are covered by automated tests and the frontend mock has canned scenarios, but neither shows extreme weather on **real HERE routes through the real Django rules** in the browser.

This adds a simulator for development: the routes still come from HERE, the forecast is replaced by a chosen scenario, and the real rules, ranking and heatmap run on it. You pick the scenario in the frontend panel.

Safety: simulated weather must never reach a real driver. It only works when Django runs with `DEBUG=True`, the selector is hidden otherwise, and every simulated plan carries a prominent banner.

## Scenarios

Each is placed relative to the planned routes, so it always hits them whatever trip you choose.

| Scenario | Weather | What it lets you see |
|---|---|---|
| Calm | Light wind, dry, everywhere | Baseline: all Low, time decides the ranking |
| Wind 38 mph everywhere | Gusts 38 mph | Load rule 3: High up to 40,000 lb, Severe above |
| Wind 48 mph everywhere | Gusts 48 mph | Load rule 2: Severe up to 30,000 lb, No Travel above |
| Wind band on the fastest route | 60 mph gusts across the middle of the fastest route, 38 mph around it | No Travel on one route; a slower route gets recommended |
| Blizzard at the destination | Snow 3.5 in/hr around the destination | Every route No Travel: red banner, fewest-No-Travel ranking |
| Heavy rain | Rain 0.6 in/hr over the first third of the fastest route, 0.3 around it | Rain thresholds deciding the level instead of wind |
| Storm moving through | A snow and wind cell that starts at the destination and travels to the origin over 48 h | ETA timing (the truck meets it or misses it) and the heatmap changing with the slider |
| No forecast | No data at all | Outage: grey checkpoints, nothing recommended |

## Backend (`weather_aware/`)

- **`trips/simulated_weather.py`** (new): the scenario list (id, label, description) and `simulated_forecasts(scenario, cells, start, end, profiles, destination)`, which returns the same `{cell: Forecast}` that `OpenMeteoClient.forecasts` returns (`trips/open_meteo.py`). Nothing downstream changes: `risk.py`, `ranking.py` and `heatmap.py` run on it exactly as on a real forecast. It reuses `RouteProfile.point_at` (`trips/sampling.py`) and `haversine_miles` (`trips/geometry.py`) to place weather along a route.
- **`trips/planner.py`**: if the request names a scenario, call the simulator instead of Open-Meteo, and add a warning with the new code `simulated_weather` ("Simulated weather: Wind band on the fastest route. Not a real forecast."). HERE is still called as normal (and its 10-minute cache means switching scenarios on the same trip costs no extra routing calls).
- **`trips/serializers.py`**: optional `weather_scenario` field. Unknown id, or any id when simulation is not allowed → `422` with `field_errors.weather_scenario`.
- **`trips/views.py` + `urls.py`**: `GET /api/trips/weather-scenarios/` returns the scenario list, or an empty list when simulation is not allowed. The frontend uses this to decide whether to show the selector, so the list lives in one place.
- **`settings.py`**: `ALLOW_WEATHER_SIMULATION = DEBUG`. One switch, off whenever `DEBUG` is off.

## Frontend (`frontend_weather/`)

- `src/api/schemas.ts`: `weather_scenario?` on the request type, the `simulated_weather` warning code, a scenario list schema.
- `src/api/trips.ts` + a `useWeatherScenarios` hook (TanStack Query, like `hooks/usePlaceSuggestions.ts`).
- `src/features/trip-form/TripForm.tsx`: a "Simulate weather (development)" select under the interval buttons, default "Real forecast", rendered only when the list is not empty. Its value goes in the request.
- `src/features/routes/WarningBanner.tsx`: the `simulated_weather` warning shown first, as an `info` alert, so a simulated result cannot be mistaken for a real one.
- Mock mode: when trips are mocked the scenario list request is answered with an empty list, so the selector stays hidden there (the mock has its own scenario destinations).

This is a third kind of request from React (the scenario list), development-only. `CLAUDE.md`'s "exactly two kinds of request" line gets a note saying so.

## Tests

In `trips/tests/`, with `ALLOW_WEATHER_SIMULATION` overridden on:

- Each scenario on the fixture route gives the expected levels: 38 mph is High at 40,000 lb and Severe at 42,000 lb; 48 mph is Severe at 30,000 lb and No Travel at 30,001 lb; blizzard makes the route No Travel with the `no_travel_all_routes` warning; no-forecast makes everything unknown with nothing recommended.
- The moving storm changes the heatmap between hour 0 and hour 48.
- Open-Meteo is not called when a scenario is used; HERE still is.
- The response carries the `simulated_weather` warning.
- With simulation not allowed: the plan request is rejected with `422`, and the scenario list is empty.

## Verification

- `manage.py test` passes; frontend `npm run lint` and `npm run build` pass.
- In a browser on the real backend, Dallas → Denver:
  - Wind 38: plan at 40,000 lb (orange checkpoints, High) then 42,000 lb (red, Severe, popup names the 40,000 lb rule).
  - Wind 48: 30,000 lb (Severe) then 31,000 lb (No Travel, banner).
  - Wind band: the fastest route shows a purple stretch and is ranked last; another route is recommended with the reason shown.
  - Blizzard: all three cards No Travel, red banner, recommendation reason mentions fewest No Travel miles.
  - Storm moving through: the heatmap blob moves as the slider moves; checkpoint colours match where the truck is when the storm is there.
  - No forecast: grey checkpoints, "Risk unknown" cards, no recommendation.
  - Every simulated plan shows the "Simulated weather" banner; "Real forecast" does not.
- With `DEBUG=False` in `.env`: the selector is gone and a hand-made request with a scenario returns 422.

I will report each case with what was actually observed, and save this plan as `docs/weather-simulator-plan.md`. Nothing is committed unless you ask.

## Status: built

95 backend tests pass (13 new); frontend lint and build pass. Every scenario was run in a browser on real Dallas to Denver routes.

One change from the plan: the wind band's width is scaled to the route length (a tenth of it, at most 20 miles) so that on a short route it does not cover most of the trip.

Not checked by hand: switching `DEBUG=False` in `.env` on a running server. The refusal and the empty scenario list in that case are covered by an automated test instead.

What the simulator showed about the app itself:

- Route cards show the average risk, so a route with No Travel miles can carry a green "Low" or yellow "Moderate" chip (blizzard: 61 No Travel miles, chip "Avg risk 0.4 · Low").
- Heatmap colour depends on how large the affected area is, so a short No Travel stretch draws orange rather than purple.
