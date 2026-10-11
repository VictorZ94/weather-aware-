# Backend: trip planning end to end (routes, checkpoints, weather, risk, ranking, heatmap)

## Context

The frontend is finished against a mock, and Django so far only serves place suggestions. This plan builds the real `POST /api/trips/plan/` in five steps, following your step-by-step document: truck routes from HERE, checkpoints with ETAs, weather from Open-Meteo, risk levels from the provided rules, a ranked recommendation, and the corridor heatmap for hours 0–48.

Your document is the authority for the rules and the steps. Three things were settled on top of it:

- **Field names and URL stay as the frontend has them**; Django adds the new information your document introduces.
- **Temperature is kept** as information only (never affects risk); visibility and the condition word go.
- **All five steps are built in one run**, each tested and checked against the live APIs before the next starts.

Kept from the earlier routing plan: the standard tractor-trailer profile you chose (your document sends gross weight only; height, width, length and axles are added so HERE avoids low bridges) and traffic-aware timing.

## The rules as implemented (single reference for `rules.py`)

**Risk thresholds** (a value on a shared boundary goes to the higher level)

| Condition | Low | Moderate | High | Severe | No Travel |
|---|---|---|---|---|---|
| Wind (mph) | under 25 | 25 to under 35 | 35 to under 45 | 45 to under 55 | 55 and above |
| Rain (in/hr) | under 0.10 | 0.10 to under 0.25 | 0.25 to under 0.50 | 0.50 to 1.00 | above 1.00 |
| Snow (in/hr) | under 0.5 | 0.5 to under 1.0 | 1.0 to under 2.0 | 2.0 to 3.0 | above 3.0 |

**Load rules** (cargo weight; they change the wind level only)

1. Wind 55 mph or more → No Travel for any load.
2. Wind 45–54 mph and cargo over 30,000 lb → No Travel.
3. Wind 35–44 mph and cargo over 40,000 lb → Severe.

**Checkpoint level** = the worst of wind (after load rules), rain and snow. Values: Low 0, Moderate 1, High 2, Severe 3, No Travel 4.

**Route recommendation**, in order: fewest Severe miles → fewest High miles → lowest average risk → shortest travel time. Routes with No Travel miles are never recommended unless every route has some.

## The two external APIs

**HERE Routing v8** — `GET https://router.hereapi.com/v8/routes`, same key as place search.
`transportMode=truck`, `origin`, `destination`, `departureTime`, `alternatives=2`, `return=polyline,summary`, `spans=length,duration,routeNumbers`, and the vehicle profile: `grossWeight` = cargo + 35,000 lb (in kg), height 13.5 ft, width 8.5 ft, length 72 ft, 5 axles, tractor with one trailer.

**Open-Meteo forecast** — `GET https://api.open-meteo.com/v1/forecast`, free, no key.
Hourly `wind_gusts_10m`, `wind_speed_10m`, `rain`, `showers`, `snowfall`, `temperature_2m`; wind in mph, precipitation in inches, time zone UTC; many locations per request.

One addition to your variable list: **`showers`**. Open-Meteo reports thunderstorm-type downpours under `showers`, separately from `rain`, so using `rain` alone would miss the heaviest rain. Rain for the rules = `rain + showers`.

**Before writing code against either API I make one live call to each** and save the answers as test fixtures. Last stage's `resultTypes` failure came from trusting documentation without a live check. If a parameter or field differs I adjust and report it.

## Step 1 — Routes

- Validate the request: both places with coordinates in range and different from each other; departure with an offset, not in the past, at most 7 days ahead; cargo above 0 (and at most 50,000 kg); interval 10, 25 or 50. Failures return `422` with `field_errors` keyed by the request field so the form shows them in place.
- Call HERE, decode each section with `flexpolyline`, join sections, flip to `[lon, lat]`.
- Keep internally, per point of the line: distance and time from the start (from the spans).
- Per route: `id`, `name` ("via I-76, I-80" from the highways carrying most miles; "Route A" as fallback), `distance_miles`, `duration_minutes`, `arrival_time`, `geometry`.
- The line sent to React is thinned to points about 100 m apart (a 1,000-mile HERE line has tens of thousands of points). Checkpoints are computed on the full line first.
- HERE notices on a route become `route_notice` warnings.
- Errors: no route → `422`; HERE down or timing out → `502`/`504` with `retryable: true`; fewer than 3 routes → `fewer_routes` warning.

**Done when:** Dallas → Denver returns 2–3 routes.

## Step 2 — Checkpoints and ETAs (`sampling.py`)

- Checkpoint at mile 0, N, 2N, … and always at the destination; count = ceil(length ÷ N) + 1.
- ETA = departure + elapsed time at that mile, interpolated from the spans. Sent in UTC.
- `miles_represented`: half the road to the previous checkpoint plus half to the next; the total equals the route length.
- `timezone` per checkpoint from `timezonefinder`, so React shows local time.

**Done when:** an 800-mile route at 25 mi has 33 checkpoints with increasing ETAs.

## Step 3 — Weather and risk (`open_meteo.py`, `rules.py`, `risk.py`)

- Snap the checkpoints of all routes to a 0.1° grid, de-duplicate, request in batches of about 100 locations, batches in parallel. Cover departure to the later of departure + 48 h and the last arrival.
- Weather at a checkpoint = the worse value of the two forecast hours around its ETA.
- Wind for the rules = gusts (one setting switches to sustained wind).
- Thresholds → load rules on wind → worst condition wins.
- Per checkpoint: `weather` (gust, sustained wind, rain in/hr, snow in/hr, temperature), `levels` for wind/rain/snow, final `risk_level`, `deciding_condition`, `load_rule` (text of the rule applied, or none), `data_status`.
- Per route: `miles_by_level` (using miles represented, plus an `unknown` bucket), `average_risk` as the mile-weighted mean 0–4, and `worst_segment` (the longest stretch at the route's worst level; a summary of the checkpoints, already shown on the cards).
- Missing forecast → level unknown, `data_status: "missing"`, and a `missing_weather` warning. If Open-Meteo is down entirely the routes are still returned, all unknown, with the warning.
- Forecasts are cached for 1 hour per grid cell.

**Done when:** a checkpoint with 38 mph wind and 42,000 lb cargo is Severe and names the load rule.

## Step 4 — Ranking and recommendation (`ranking.py`)

- Excluded from recommendation: routes with any No Travel miles, or with over 20% of miles unknown. If all are excluded, rank by fewest No Travel miles and add the `no_travel_all_routes` warning ("consider a later departure").
- Sort: Severe miles → High miles → average risk → duration, with Severe and High miles rounded to the nearest 5 so tiny differences count as ties.
- `rank` on every route; `recommended_route_id`; `recommendation_reason` from the first rule that separated the winner from the runner-up, for example "Fewest Severe miles (0 vs 50)" or "All routes equally safe; fastest by 24 min".
- All routes are always returned and drawn.

## Step 5 — Heatmap (`heatmap.py`)

- Points: the unique 0.1° grid cells along all routes. Hours: hour 0 = departure rounded down, 49 values.
- Same rules and cargo weight for each point and hour → level 0–4, or −1 when unknown. Reuses Step 3's forecasts: no extra API call.
- Compact shape: `heatmap: { hour0, points: [[lon, lat], …], levels: [[49 values] per point] }`.

## Response contract (frontend names; **new** or **changed** marked)

```
origin, destination, departure_time, checkpoint_interval_miles
recommended_route_id, recommendation_reason
warnings[]: code (no_travel_all_routes | fewer_routes | missing_weather | route_notice NEW), message
routes[]:
  id, name, geometry, distance_miles, duration_minutes, arrival_time
  rank                                   NEW
  average_risk                           CHANGED: number 0–4 or null (was a level name)
  miles_by_level { low … no_travel, unknown NEW }
  worst_segment
  checkpoints[]:
    id, seq NEW, mile, lat, lon, eta (UTC), timezone, miles_represented NEW
    risk_level, levels { wind, rain, snow } NEW, deciding_condition, load_rule, data_status NEW
    weather: wind_gust_mph, wind_speed_mph, rain_in NEW unit, snow_in NEW unit, temperature_c
             (visibility and condition REMOVED)
heatmap: { hour0, points, levels }       CHANGED shape
errors: { detail, field_errors?, retryable? NEW }
```

## Code layout

```
weather_aware/
  here/              shared HERE plumbing moved out of places/here.py
    client.py        httpx, retries, error classes, key-safe logging (existing code, reused)
    autosuggest.py   place search, behaviour unchanged
    routing.py       truck routes
  places/            imports from here/; its 17 tests keep passing
  trips/             new app
    serializers.py   request validation -> field_errors
    geometry.py      distances, point-at-mile, thinning
    sampling.py      Step 2
    open_meteo.py    Step 3 fetch, grid snapping, batching, cache
    rules.py         thresholds and load rules as data; the only place they live
    risk.py          classify a checkpoint; per-route totals
    ranking.py       Step 4
    heatmap.py       Step 5
    planner.py       runs the steps in order and assembles the response
    views.py, urls.py
    tests/           live-call fixtures + unit tests per module
  settings.py        TRUCK_PROFILE, RISK_WIND_SOURCE, trips app, throttle (20 plans/min per IP)
  requirements.txt   + flexpolyline, timezonefinder
```

`rules.py` holds no I/O and `open_meteo.py` holds no rules, so each is tested alone. HERE answers are cached 10 minutes per identical request.

## Frontend changes

The UI is built; these bring it in line with the contract above.

- `src/api/schemas.ts`: the new and changed fields.
- Route cards: ordered by `rank`; average risk shown as a number with its nearest level name (e.g. "1.3 · Moderate"), "Risk unknown" when null; miles bar reads the `unknown` bucket.
- Checkpoint popup: wind, rain and snow each with its own level; temperature; deciding condition; load rule. Visibility and condition removed.
- Heatmap layer and slider: read the compact shape; weight = level ÷ 4; hour 0 from `hour0`.
- Error alert: Retry offered when `retryable` is not false. Request timeout raised from 30 s to 60 s, since one plan now waits on HERE and Open-Meteo.
- `route_notice` warnings shown in the banner.
- Mock: `generateTrip.ts` updated to the new shape so the offline scenarios (Errorville, Blizzard Pass, Two Roads, Deadzone) keep working; a `VITE_MOCK_TRIPS` flag beside `VITE_MOCK_PLACES` switches to the real endpoint.

React still applies no risk rules: it maps levels to colours.

## Build order

1. New branch `trip-planning`; install packages; live calls to HERE Routing and Open-Meteo; save fixtures.
2. Move HERE plumbing to `here/`; place tests green.
3. Steps 1 → 5 in order, each with its tests and a live check before the next.
4. Frontend changes; mock updated.
5. Browser run against the real backend.
6. Save this plan as `docs/backend-trip-plan.md`; update `CLAUDE.md` and write the README with the assumptions table.

I will not commit or push unless you ask.

## Verification

Automated (`manage.py test`, no key or network):

- **Rules:** every threshold boundary for wind, rain and snow; each load rule just below and above 30,000 and 40,000 lb; 38 mph + 42,000 lb → Severe with the rule named.
- **Sampling:** count = ceil(length ÷ N) + 1, last = destination, ETAs increase, miles represented sum to the route length.
- **Weather:** worse-of-two-hours; rain = rain + showers; grid de-duplication; a missing cell → unknown + warning; Open-Meteo down → routes still returned.
- **Ranking:** one test per sorting step; rounding to 5 miles; No Travel never recommended; all-excluded case; reason text.
- **Heatmap:** 49 hours per point, levels in −1…4, hour 0 = departure rounded down.
- **Endpoint:** the fixture response satisfies the full contract; each validation case → 422 with the right `field_errors` key; no route, missing key, HERE failures → documented status and `retryable`.

Live, with your HERE key (I run these and report the numbers):

- Dallas → Denver and Denver → Chicago: 2–3 routes, distances and durations compared with known figures, checkpoint counts matching the formula.
- One checkpoint's weather compared by hand with Open-Meteo's own answer for that location and hour.

Browser, frontend on the real backend (`VITE_MOCK_PLACES=false`, `VITE_MOCK_TRIPS=false`):

- Routes follow real highways; cards ordered by rank with the recommendation reason; coloured checkpoints with the new popup; heatmap changes with the slider with no request; trucks move; a Django validation error appears under the right form field; the mock scenarios still work with the flags back on.
- Frontend `npm run lint` and `npm run build` pass.

## Assumptions (go into the README)

| Gap | Assumption | Reason |
|---|---|---|
| Cargo or gross weight? | Cargo; HERE gets cargo + 35,000 lb | An empty truck alone exceeds 30,000 lb, so the load rules only make sense for cargo |
| Values on shared boundaries | Go to the higher level | Cautious |
| Sustained wind or gusts? | Gusts, switchable | Gusts cause blow-overs |
| Rain variable | `rain + showers` | Open-Meteo splits them; downpours are in `showers` |
| No Travel isn't in the ranking list | Never recommended unless every route has it | Speed can't offset a No Travel stretch |
| "Average risk" undefined | Mile-weighted mean of levels 0–4 | Simple and explainable |
| ETA between forecast hours | Worse of the two hours | Cautious |
| Fewer than 3 routes from HERE | Show what exists with a warning | Honest about real options |
| Hour 0 of the slider | Departure time | The driver cares about their trip |
| Truck dimensions | Fixed standard tractor-trailer | Not collected in the form |
| Rest breaks, weather-slowed ETAs | Not modelled | Out of scope; future work |

## Not included

Extra routes through forced waypoints when HERE returns fewer than 3 (your document's first cut). Whether truck routing is inside your HERE plan's free allowance I have not checked; each plan is one routing call, limited by the cache and throttle.

## Status: built

All five steps are built. 82 backend tests pass; frontend lint and build pass.

Checked against the live services:

- Dallas → Denver: 3 routes (799, 883 and 883 miles) in about 8 seconds; 33 checkpoints on the 799-mile route at 25 miles.
- Denver → Chicago: 3 routes (1,006 to 1,055 miles, 14.7 to 15.9 hours); checkpoint counts match ceil(length ÷ N) + 1.
- One checkpoint's weather compared by hand with Open-Meteo's own answer: identical (worse of the two hours for each value).
- In a browser on the real backend: routes on real highways, ranked cards with the reason, checkpoint popups, heatmap changing with the slider with no request, truck markers, and a Django validation error shown under the Cargo weight field.

Differences from the plan above:

- `spans` also asks HERE for `dynamicSpeedInfo`. Without it a 1,000-mile route came back with about 50 spans; with it about 600, so ETAs follow real speed changes.
- Arrival time is the request's departure plus HERE's duration, not HERE's echoed arrival field (same value, one less thing to parse).
- Thinning has little effect: HERE lines have about 8,000 points per 1,000 miles, not tens of thousands. It is kept at about 0.1 mile.
- Route names leave out highways carrying under 10% of the route, so short connecting roads do not appear.
- Cargo is converted to whole pounds, and the frontend now sends kg with two decimals, so a load entered as exactly 40,000 lb is not treated as "over 40,000".
- When weather is missing for every route, nothing is recommended (routes are still ranked by time).
- A plan response is about 300–400 KB for a 1,000-mile trip.
