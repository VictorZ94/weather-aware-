# Remove the fake backend and the weather simulator

## Context

The frontend still carries test-only code from before Django existed: a Mock Service Worker backend that invents places, routes and weather, with trigger cities for special cases. Django also has a weather simulator that swaps the real forecast for made-up scenarios. None of this belongs in a production app. After this change the frontend always talks to Django, and every plan uses the real NWS forecast.

## Order of work

1. Commit the finished automatic-checkpoints change on `auto-checkpoints` as its own commit (not pushed).
2. Create `remove-test-code` from it and make the changes below there. Nothing else is committed or pushed unless you ask.

## Frontend (`frontend_weather/`)

- Delete `src/mocks/` (`browser.ts`, `handlers.ts`, `generateTrip.ts`, `places.ts`) and `public/mockServiceWorker.js`.
- `src/main.tsx`: drop `enableMocking()` and render straight away.
- `package.json`: `npm uninstall msw` (updates the lock file) and remove the `"msw"` block (worker directory).
- `eslint.config.js`: drop `public/mockServiceWorker.js` from `globalIgnores`.
- `.env.development`: keep only `VITE_API_BASE_URL=/api`; remove `VITE_USE_MOCKS`, `VITE_MOCK_PLACES`, `VITE_MOCK_TRIPS` and their comments. Remove the mock comment in `vite.config.ts` (the `/api` proxy to port 8000 stays).
- Simulator:
  - Delete `src/hooks/useWeatherScenarios.ts`.
  - `src/api/trips.ts`: remove `listWeatherScenarios`.
  - `src/api/schemas.ts`: remove `weatherScenariosSchema`, `WeatherScenario`, `weather_scenario` from `TripPlanRequest`, and the `simulated_weather` warning code.
  - `components/trip-form/TripForm.tsx` + `tripSchema.ts`: remove the "Simulate weather (test)" select, the `weatherScenario` field, its default, `SERVER_FIELDS` entry, and the imports left unused (`TextField`, `MenuItem`).
  - `components/routes/WarningBanner.tsx`: remove the `simulated_weather` entry.

## Backend (`weather_aware/`)

- Delete `trips/simulated_weather.py` and `trips/tests/test_simulator.py`.
- `trips/planner.py`: always `NwsClient().forecasts(...)`; remove the scenario branch and the `simulated_weather` warning.
- `trips/serializers.py`: remove the `weather_scenario` field and validator (and the `settings` import if it becomes unused). A request that still sends the field is ignored.
- `trips/views.py` / `trips/urls.py`: remove `WeatherScenariosView` and `GET /api/trips/weather-scenarios/`.
- `weather_aware/settings.py` and `.env.example`: remove `ALLOW_WEATHER_SIMULATION`.
- Check the other tests for any scenario use and remove it.

## Docs

- `CLAUDE.md`: remove the "Fake backend" and "Weather simulator" paragraphs and the mention of the scenarios request; say `npm run dev` needs Django running on port 8000; fix the stale lines at the same time ("Built and working against a fake backend", "The directory is not a git repository", "There are no tests yet" — the backend has tests, the frontend has none).
- `README.md`: remove the simulator and mock sections.
- Save this plan as `docs/remove-test-code-plan.md`. Older plans stay as the record of what was decided then.

## Production

- On Render, the `ALLOW_WEATHER_SIMULATION` variable can be deleted; it is ignored from now on.
- The request no longer sends `weather_scenario`, and the server ignores it if an old page sends it, so this change can go out in either order.

## Verification

- `grep` finds no `msw`, `mock`, `scenario` or `simulat` left in source (outside `docs/`).
- `manage.py test` passes (fewer tests, since `test_simulator.py` is gone); `npm run lint` and `npm run build` pass.
- Browser, on my own Vite on another port against your Django on 8000: no simulator select, place suggestions come from Django, a plan loads with 3 routes and no warnings about simulation; no service-worker registration in the page.
