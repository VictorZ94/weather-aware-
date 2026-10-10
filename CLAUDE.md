# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A weather-aware routing app for truck drivers: given origin, destination, departure time, cargo weight and a checkpoint interval, it shows up to 3 routes with weather risk along each and recommends the safest.

- `frontend_weather/` — React frontend. Built and working against a fake backend.
- `weather_aware/` — Django 6.1 + Django REST Framework backend. Only the place-suggestions endpoint exists so far (`places` app); trip planning is still mocked in the frontend.
- `venv/` — Python virtualenv for the backend; packages are pinned in `weather_aware/requirements.txt`.
- `docs/` — the approved plans (`frontend-plan.md`, `backend-places-plan.md`), including the API contract and the decisions behind it. Save each new approved plan here.

The directory is not a git repository.

## Commands

Frontend (run from `frontend_weather/`):

```
npm run dev       # Vite dev server; MSW answers /api/* (see below)
npm run build     # tsc -b && vite build — this is the type-check
npm run lint      # eslint
```

There are no tests yet (a deliberate choice for this stage).

Backend (run from `weather_aware/`, Windows venv):

```
..\venv\Scripts\python.exe manage.py runserver       # port 8000, which the Vite /api proxy targets
..\venv\Scripts\python.exe manage.py test places     # all backend tests (no key or network needed)
..\venv\Scripts\python.exe manage.py test places.tests.SuggestPlacesTests.test_repeated_text_is_served_from_cache   # one test
```

Settings read `weather_aware/.env` (template: `.env.example`); `SECRET_KEY` is required and `HERE_API_KEY` enables place search.

## Division of responsibility (hard rule)

React never calls HERE or Open-Meteo, holds no API keys, and applies no risk rules. It maps a risk level to a colour and label and nothing more; `average_risk`, `miles_by_level`, `deciding_condition`, `load_rule`, `warnings` and the recommendation all arrive computed from Django.

React makes exactly two kinds of request:

- `GET /api/places/suggest/?q=` — autocomplete suggestions.
- `POST /api/trips/plan/` — everything for a trip in one response: routes, checkpoints, warnings, and the risk heatmap for hours 0–48.

## Frontend architecture

Stack: Vite 8, React 19 with the React Compiler, TypeScript 6, MUI 9 (+ MUI X date pickers), react-hook-form + zod 4, TanStack Query 5, MapLibre GL 6 through `react-map-gl/maplibre`, Day.js, MSW 3. Several of these are recent majors with changed APIs; check current docs before writing against them.

**The contract lives in `src/api/schemas.ts`.** zod schemas define every response, TypeScript types are inferred from them, and `api/client.ts` parses each response before it reaches a component. When the Django API is built it must match these schemas; change the schema first when the contract changes. The API always uses kg and °C, and every time is ISO 8601 with an offset. Each place and checkpoint carries an IANA `timezone`.

**Fake backend.** `src/mocks/` is a stand-in for Django using Mock Service Worker, enabled by `VITE_USE_MOCKS=true` in `.env.development`. `generateTrip.ts` invents routes, weather and risk rules; those rules belong to Django in the real system, so app code must never import from `src/mocks/` (only `main.tsx` starts the worker). Connecting the real backend means setting `VITE_USE_MOCKS=false`; `vite.config.ts` already proxies `/api` to `localhost:8000`. Mock destinations in `mocks/places.ts` trigger special cases: Errorville (500), Blizzard Pass (No Travel on all routes), Two Roads (2 routes), Deadzone (missing weather). `?mockDelay=10000` in the page URL slows the plan request.

**State flow.** `hooks/usePlanTrip.ts` holds the submitted request and runs it as a `useQuery` (not a mutation), keyed on the request, and keeps the last successful plan so it stays on screen while a new one loads or fails. `App.tsx` owns `selectedRouteId`, `hour` and `showTrucks` and passes them to the panel and the map; both the route cards and the map lines set `selectedRouteId`. State is reset from new data with the set-state-during-render pattern rather than effects (the hooks lint rule rejects set-state in effects).

**Map.** `features/map/RouteMap.tsx` composes the layers. Checkpoints are a circle layer, not DOM markers. The heatmap loads all 49 hours into one GeoJSON source once and the slider only changes the layer `filter`, which is what makes hour switching instant; keep it that way. `maplibreWorker.ts` sets MapLibre's worker URL via Vite's `?worker&url` — MapLibre 6 cannot find its worker otherwise once bundled. The base map is the OpenFreeMap style URL (no key).

**Time zones.** Use the `dayjs` export from `utils/dayjs.ts` (plugins registered there). The date picker works in wall-clock time; `wallClockInZone` reinterprets it as local time at the origin. Times are displayed in the zone of the place they refer to: departure and slider in the origin's zone, arrival in the destination's, each checkpoint ETA in its own.

**Units.** `context/UnitsContext` holds lb/kg and °F/°C, persisted to `localStorage`. Conversion is display-only.

**Risk levels and colours.** Five levels (`low`, `moderate`, `high`, `severe`, `no_travel`) plus "no data" for checkpoints without a forecast. Colours and labels come only from `src/theme.ts`.

## Backend architecture

`places/here.py` is the only module that knows HERE's URLs, parameters and response format; it maps results to the frontend's shape and raises `HereError` subclasses (DRF `APIException`s, so they render as `{"detail": ...}` with the right status). It uses `httpx` with `tenacity`: 3 attempts on timeouts, connection errors and 5xx, none on 4xx. Views stay thin: validate, cache, call the client, serialize.

Place suggestions use HERE Autosuggest with `show=tz`, so coordinates and the IANA time zone come back in one call. Results are cached in memory for 24 h and the endpoint is throttled per IP. Do not send Autosuggest's `resultTypes` parameter: the live endpoint rejected every value tried, so businesses and category suggestions are filtered out in `_to_suggestion` by each item's `resultType` instead.

HERE takes the API key as a query parameter, so never log request URLs; the `httpx` logger is held at WARNING in settings for that reason.

Tests swap `HereClient.transport` for an `httpx.MockTransport` and `HereClient.wait` for `wait_none()`. The cache is cleared in `setUp`, which also resets the throttle counters.

To use real suggestions in the frontend while trip planning stays mocked, set `VITE_MOCK_PLACES=false` in `frontend_weather/.env.development`.

## TypeScript and lint constraints

- `erasableSyntaxOnly`: no enums and no constructor parameter properties.
- `verbatimModuleSyntax`: type-only imports need `import type` / `type` modifiers.
- `react-refresh/only-export-components`: a file that exports a component exports nothing else, which is why `UnitsContext.ts` and `UnitsProvider.tsx` are separate files.
- MUI 9 uses `slotProps` / `slots` (for example `slotProps.input.endAdornment` on `TextField`), not the older `InputProps`-style props.
