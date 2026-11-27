# Checkpoints placed automatically (gaps 10 → 25 → 50, repeating)

## Context

Today the driver picks a checkpoint interval (10, 25 or 50 mi) in the form and Django places checkpoints evenly at that interval. The driver should not have to choose: Django places them itself, with the gap between checkpoints cycling **10, 25, 50, 10, 25, 50 …** miles, and always a checkpoint at the destination.

Example, 320 mi route: mile 0 · 10 · 35 · 85 · 95 · 120 · 170 · 180 · 205 · 255 · 265 · 290 · 320.

## Backend (`weather_aware/trips/`)

- **`sampling.py`**
  - Add `CHECKPOINT_GAPS_MILES = (10, 25, 50)`, the one place the pattern lives.
  - `checkpoint_miles(total_miles)` drops its `interval_miles` argument: start at 0, add the gaps in turn (`itertools.cycle`), stop before the end, append the destination (same end handling as today).
  - `place_checkpoints(profile, departure)` drops the interval argument. Nothing else changes: `miles_represented` / `covers_from/to_mile` are already computed from the neighbours, so uneven gaps are handled and still sum to the route length; risk totals, ranking and heatmap are unaffected.
- **`serializers.py`**: remove the `checkpoint_interval_miles` field, its validator and the `INTERVALS` constant. A request that still sends the field is accepted and the field ignored (DRF default).
- **`planner.py`**: stop reading the interval; in the response replace `checkpoint_interval_miles` with `checkpoint_gaps_miles: [10, 25, 50]` (from `CHECKPOINT_GAPS_MILES`), so the map legend describes the spacing from Django instead of React knowing it.
- **Tests**
  - `test_sampling.py`: replace the interval-count tests with: 320 mi gives exactly the miles in the example above; first is 0, last is the total; gaps follow 10/25/50 in order; short routes (7 mi → `[0, 7]`, 30 mi → `[0, 10, 30]`); `miles_represented` still sums to the length. Update the other `place_checkpoints` calls (the "mile 100 after 1h40" test uses mile 95 or 120 instead, both checkpoints now).
  - `test_endpoint.py`: the interval loop becomes one check that the checkpoint miles follow the pattern and end at the arrival; the response key set has `checkpoint_gaps_miles`; drop the invalid-interval assertion and `checkpoint_interval_miles` from the base request.

## Frontend (`frontend_weather/src/`)

- **`api/schemas.ts`**: remove `CHECKPOINT_INTERVALS`, `CheckpointInterval` and `checkpoint_interval_miles` from `TripPlanRequest`; in `tripPlanSchema` replace `checkpoint_interval_miles` with `checkpoint_gaps_miles: z.array(z.number())`.
- **`components/trip-form/tripSchema.ts`** and **`TripForm.tsx`**: remove the `interval` field, its default, the "Check weather every" toggle group, its `SERVER_FIELDS` entry, and the now-unused imports (`ToggleButton*`, `FormControl`, `FormLabel`, `FormHelperText`).
- **`components/map/RiskLegend.tsx`** / **`RouteMap.tsx`**: the prop becomes `gapsMiles: number[] | null`; caption "Weather sampled every 10, 25, 50 mi in turn".
- **`mocks/generateTrip.ts`**: place mock checkpoints with the same repeating gaps and return `checkpoint_gaps_miles` (the mock must follow the contract).

## Docs

- Save this plan as `docs/checkpoint-spacing-plan.md`.
- `README.md` line 3 and `CLAUDE.md` line 7: say checkpoints are placed by Django with gaps of 10, 25 and 50 mi in turn, not chosen by the driver. Older plans in `docs/` stay as the record of what was decided then.

## Deploying

Request and response both change, so Render and Vercel should go out together (merging to `main` triggers both). Between the two deploys, an old page against a new server, or the reverse, fails to plan; it clears once both are live.

## Verification

- `manage.py test` (all backend tests) from `weather_aware/`.
- `npm run lint` and `npm run build` from `frontend_weather/`.
- In a browser (my own Vite on another port; your servers on 8000/5173 untouched): the form has no interval buttons; a plan against the mock and against Django (`VITE_MOCK_TRIPS=false`) shows checkpoints at 0, 10, 35, 85, 95 … on the map and in the timeline, and the legend caption reads the new text.

Work goes on a new branch from `main`; nothing is committed unless you ask.
