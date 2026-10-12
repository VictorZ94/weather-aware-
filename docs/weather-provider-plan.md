# Switch the weather source to the US National Weather Service

## Context

On Render, Open-Meteo answers `429 Daily API request limit exceeded`. Its free limit is counted per IP address, and Render's address is shared with many other apps, so production gets no forecasts. You chose to switch provider rather than pay for an Open-Meteo key.

## Which provider

I checked three with live calls and their published terms:

| Provider | Verdict |
|---|---|
| **US National Weather Service** (`api.weather.gov`) | **Recommended.** Free, no key, identifies apps by a `User-Agent` header. Hourly gusts and wind for about 8 days. US only, which matches the app. |
| MET Norway | Free and not IP-limited, but it returned **no gusts** for Denver and only 60 hours of hourly data. The risk rules use gusts. |
| WeatherAPI.com | Free plan is 100,000 calls a month with a 3-day forecast and no bulk requests: about 250 long trips a month, and departures limited to 3 days ahead. |

## What you give up with NWS

- **Rain and snow come as 6-hour totals, not hourly.** The app will use the total divided by 6 as the hourly rate. A short downpour inside a 6-hour block is averaged down, so rain and snow levels will read lower than with Open-Meteo. Wind, which drives the load rules, stays hourly.
- **Two requests per location** (find the grid cell, then get its forecast) and no batching. To keep a long trip under about 15 seconds, forecasts are fetched per 0.25° cell (about 17 miles) instead of 0.1°. Checkpoints and heatmap points keep their positions and use the forecast of the cell they fall in.
- **The request limit is unpublished.** NWS says it is generous; I cannot test it from Render before you deploy.

## Changes (backend only)

- **`trips/nws.py`** (new): `NwsClient.forecasts(cells, start, end)` returning the same `{cell: Forecast}` as `OpenMeteoClient.forecasts`, so `risk.py`, `ranking.py`, `heatmap.py` and the simulator are untouched. It:
  - calls `/points/{lat},{lon}` (cached 30 days; the mapping does not change) then the `forecastGridData` URL (cached 1 hour, matching NWS's own `Cache-Control`);
  - expands NWS's time intervals (`2026-10-12T00:00:00+00:00/PT2H`) into hourly lists;
  - converts km/h to mph and mm to inches;
  - sends a `User-Agent` from a new `NWS_USER_AGENT` setting;
  - retries on timeouts and 5xx, logs every failure like the current client, and leaves failed cells absent (shown as unknown).
- **`trips/open_meteo.py`**: `Forecast` and `grid_cell` stay where they are; `grid_cell` takes the cell size from the active provider.
- **`trips/planner.py`**: pick the client from a new setting `WEATHER_PROVIDER` (`nws` by default, `open_meteo` still available).
- **`settings.py` / `.env.example`**: `WEATHER_PROVIDER`, `NWS_USER_AGENT`.
- **Tests**: a saved real NWS answer as a fixture; interval expansion, unit conversion, 6-hour totals to hourly rates, missing cells, and the plan endpoint running on NWS. Existing Open-Meteo tests stay.
- **`README.md`, `CLAUDE.md`**: the provider, the 6-hour averaging as a stated assumption, and the new variables. Plan saved as `docs/weather-provider-plan.md`.

No frontend change: the API contract is the same.

## On Render after merging

```
WEATHER_PROVIDER=nws
NWS_USER_AGENT=weather-aware (your-email-or-site)
```

## Verification

- `manage.py test` passes.
- Locally with `WEATHER_PROVIDER=nws`: plan Dallas → Denver, time it, and hand-check one checkpoint's gust against the NWS answer for that point.
- A second plan of the same trip is fast (cache).
- After you deploy: plan a trip on production and confirm checkpoints have weather; check the Render log for `NWS` lines. This is the step that proves the fix, and only you can trigger the deploy.

Nothing is committed unless you ask.

## Status

Built on branch `nws-weather`. 107 backend tests pass (12 new).

Measured locally against the live services:

- Dallas → Denver (3 routes, about 880 miles, 358 heatmap points, about 150 NWS forecasts): first plan 29 s at 10 parallel requests; the client now runs 20 in parallel, which fetched the same corridor in 7 s instead of 16 s. A repeat plan took 4 s.
- Chicago → Kansas City (3 routes, about 540 miles): first plan 16 s, repeat 5 s.
- Every checkpoint and heatmap value had weather. One checkpoint was checked by hand against NWS: gust 17.3 mph and wind 11.5 mph both matched.
- Seven cities across the US returned 187–192 usable hours (about 7.8 days) with no gaps.

Differences from the plan:

- Checkpoints and heatmap points keep the 0.1° grid; `nws.py` groups them into 0.25° areas internally, so `grid_cell` did not change.
- The in-memory cache limit was raised from 300 to 5,000 entries; one long trip alone stores several hundred.

Not verified: behaviour on Render (request limits, speed on a small instance).
