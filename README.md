# Weather-aware truck routing

Plans a truck trip and shows up to 3 routes with the weather risk along each, so a driver can pick the safest one. For every route it samples the forecast every 10, 25 or 50 miles at the time the truck will be there, rates each checkpoint with the risk and load rules, recommends a route, and draws a risk heatmap for the next 48 hours.

- `frontend_weather/` — React, MUI and MapLibre. Draws what Django sends; holds no API keys and applies no risk rules.
- `weather_aware/` — Django REST Framework. Gets truck routes from HERE and forecasts from Open-Meteo, applies the rules, ranks the routes.
- `docs/` — the plans each stage was built from.

## Running it

Backend (from `weather_aware/`):

```
python -m venv ..\venv
..\venv\Scripts\pip install -r requirements.txt
copy .env.example .env        # then set HERE_API_KEY and SECRET_KEY
..\venv\Scripts\python manage.py runserver
```

A free HERE key comes from platform.here.com (Access Manager → your app → API keys). Open-Meteo needs no key.

Frontend (from `frontend_weather/`):

```
npm install
npm run dev
```

By default the frontend answers its own requests with a built-in mock, so it runs without the backend. To use Django, set both flags to `false` in `frontend_weather/.env.development`:

```
VITE_MOCK_PLACES=false
VITE_MOCK_TRIPS=false
```

Tests: `..\venv\Scripts\python manage.py test` in `weather_aware/` (no key or network needed). Frontend checks: `npm run lint` and `npm run build`.

## The API

- `GET /api/places/suggest/?q=den` — place suggestions for the origin and destination fields.
- `POST /api/trips/plan/` — everything for a trip in one response: routes, checkpoints with ETA, weather and risk, the ranking and recommendation, and the heatmap.

The exact shapes are the zod schemas in `frontend_weather/src/api/schemas.ts`.

## The rules

Risk level of each condition (a value on a shared boundary goes to the higher level):

| Condition | Low | Moderate | High | Severe | No Travel |
|---|---|---|---|---|---|
| Wind (mph) | under 25 | 25 to under 35 | 35 to under 45 | 45 to under 55 | 55 and above |
| Rain (in/hr) | under 0.10 | 0.10 to under 0.25 | 0.25 to under 0.50 | 0.50 to 1.00 | above 1.00 |
| Snow (in/hr) | under 0.5 | 0.5 to under 1.0 | 1.0 to under 2.0 | 2.0 to 3.0 | above 3.0 |

Load rules (cargo weight; they change the wind level only):

1. Wind 55 mph or more → No Travel for any load.
2. Wind 45–54 mph and cargo over 30,000 lb → No Travel.
3. Wind 35–44 mph and cargo over 40,000 lb → Severe.

A checkpoint's level is the worst of wind (after the load rules), rain and snow.

Routes are ranked by fewest Severe miles, then fewest High miles, then lowest average risk, then shortest travel time. Risk decides first; time breaks ties. All routes are always shown; ranking only marks one as recommended.

The rules live in one file, `weather_aware/trips/rules.py`.

## Assumptions

The rules leave some gaps. Each choice below is cautious and easy to change.

| Gap | Assumption | Reason |
|---|---|---|
| Cargo or gross weight? | Cargo. HERE gets cargo + 35,000 lb | An empty truck alone exceeds 30,000 lb, so the load rules only make sense for cargo |
| Values on shared boundaries | Go to the higher level | Cautious |
| Sustained wind or gusts? | Gusts (`RISK_WIND_SOURCE` in settings switches it) | Gusts cause blow-overs |
| Rain variable | Open-Meteo `rain` + `showers` | Open-Meteo reports downpours separately as `showers` |
| No Travel is not in the ranking list | Never recommended unless every route has some; then the one with the fewest No Travel miles, with a warning | Speed cannot offset a No Travel stretch |
| "Average risk" undefined | Mile-weighted mean of the levels 0–4 | Simple and explainable |
| Ties | Severe and High miles compare to the nearest 5 miles, average risk to one decimal | Tiny differences should not decide |
| ETA between forecast hours | The worse of the two hours | Cautious |
| Missing forecast | Level unknown; a route missing weather for over 20% of its miles is not recommended | No safety claim without data |
| Fewer than 3 routes from HERE | Show what exists with a warning | Honest about real options |
| Hour 0 of the slider | Departure time, rounded down to the hour | The driver cares about their trip |
| Truck dimensions | Fixed standard tractor-trailer: 13.5 ft high, 8.5 ft wide, 72 ft long, 5 axles | Not collected in the form |
| Weather sampling grid | 0.1° cells; nearby checkpoints share a forecast | Fewer forecast requests |

## Not modelled

Rest breaks and hours-of-service limits, weather slowing the truck down (ETAs come from HERE's traffic-aware timing only), road closures, and visibility or ice. Departures are limited to 7 days ahead.
