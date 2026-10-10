# Backend stage 1: place suggestions endpoint (Django)

## Context

The React frontend is finished against a fake backend. It makes two kinds of request; this stage builds the first one for real: `GET /api/places/suggest/?q=<text>`, which feeds the Origin and Destination autocomplete. The plan-trip endpoint is out of scope and stays mocked.

Starting point: `weather_aware/` is an untouched Django 6.1 `startproject` skeleton (no apps, no API). `venv/` has Django only.

The response shape is already fixed by the frontend in `frontend_weather/src/api/schemas.ts` (`suggestResponseSchema`, `placeSchema`, `apiErrorSchema`), and Django must match it:

```json
{ "suggestions": [ { "id": "...", "label": "Denver, CO, United States", "lat": 39.74, "lon": -104.99, "timezone": "America/Denver" } ] }
```

Errors are `{ "detail": "message" }` with a 4xx/5xx status.

## Which API: HERE Autosuggest

`GET https://autosuggest.search.hereapi.com/v1/autosuggest` (HERE Geocoding & Search API v7).

Why this one:

- It is built for type-ahead: it accepts partial text and tolerates typos.
- Each result already has coordinates (`position.lat` / `position.lng`), so one call per keystroke is enough. HERE's other type-ahead endpoint, Autocomplete, returns no coordinates and would need a second Lookup call.
- With `show=tz` each result also carries its IANA time zone (`timeZone.name`), which the frontend needs to show local times. No separate time zone service or library.
- Same provider as routing later, so one HERE account and one key for the whole backend.

Request Django will send:

| Parameter | Value | Purpose |
|---|---|---|
| `q` | the driver's text | |
| `in` | `countryCode:USA` | USA only |
| `at` | `39.8283,-98.5795` | Required search centre; the middle of the USA so no region is favoured |
| `show` | `tz` | Adds the time zone |
| `limit` | `20` | More than the 8 we return, because non-address results are dropped afterwards |
| `termsLimit` | `0` | No query-completion terms |
| `lang` | `en-US` | |
| `apiKey` | from `.env` | |

Mapping HERE item → suggestion: `id` → `id`, `address.label` (fall back to `title`) → `label`, `position.lat` → `lat`, `position.lng` → `lon`, `timeZone.name` → `timezone`. Items missing a position or time zone are dropped, since the frontend cannot use them.

Getting a key (you do not have one yet): create a free account at platform.here.com, create a project/app under Access Manager, and generate an API key. The free plan covers development volumes. Until the key is in `.env`, the endpoint answers with a clear "not configured" error and the tests run against a faked HERE response.

## Stack

Django + Django REST Framework, `httpx` for external APIs, plain Python for the logic.

Used in this stage: `djangorestframework`, `django-cors-headers`, `django-environ`, `httpx`, `tenacity`.

From the full backend stack but **not installed yet**, because nothing in this endpoint uses them: `flexpolyline` (decoding HERE route lines) and `timezonefinder` (time zones for checkpoints along a route). They arrive with the plan-trip stage. Suggestions get their time zone straight from HERE via `show=tz`.

## Decisions

| Topic | Choice |
|---|---|
| API framework | Django REST Framework |
| HTTP client | `httpx`, 5 s timeout |
| Retries | `tenacity`: 2 retries with short exponential backoff on timeouts, connection errors and HERE 5xx. No retry on 4xx (bad key, rate limit), where retrying cannot help. |
| Secrets | `HERE_API_KEY` in `weather_aware/.env`, loaded with `django-environ`; `.env.example` sits beside it as the template. The existing hard-coded `SECRET_KEY`, `DEBUG` and `ALLOWED_HOSTS` move to `.env` too. |
| CORS | `django-cors-headers`, allowing the Vite dev origin (`http://localhost:5173`, configurable in `.env`). The Vite `/api` proxy keeps working as well. |
| Caching | Django's in-memory cache, keyed on the lower-cased trimmed text, 24 h. Repeated and backspaced text costs no HERE call. |
| Rate limit | DRF anonymous throttle, 120 requests/minute per IP, so a stuck client cannot burn the HERE quota |
| Auth | None (public endpoint, same as the frontend expects) |
| Database | Not used by this endpoint; no models |

## Behaviour

| Case | Response |
|---|---|
| `q` missing, blank or under 2 characters | `200 {"suggestions": []}` (the frontend never sends these; no HERE call) |
| `q` over 100 characters | `400 {"detail": "Search text is too long."}` |
| Normal | `200 {"suggestions": [...]}`, up to 8 |
| No `HERE_API_KEY` configured | `503 {"detail": "Place search is not configured."}` |
| HERE rejects the key (401/403) | `502 {"detail": "Place search is unavailable."}`, real cause logged |
| HERE rate-limits (429) | `503 {"detail": "Place search is busy. Try again shortly."}` |
| HERE times out, is unreachable or returns 5xx, after the retries | `504 {"detail": "Place search took too long."}` for timeouts, otherwise `502 {"detail": "Place search is unavailable."}` |
| Our own throttle hit | `429` (DRF default, already `{"detail": ...}`) |

The frontend already shows "Could not load suggestions" in the dropdown for any failure. The API key never appears in a response or a log line.

## Files

New app `places` inside `weather_aware/`:

```
weather_aware/
  requirements.txt            Django, djangorestframework, django-cors-headers, django-environ, httpx, tenacity
  .env.example                HERE_API_KEY=, SECRET_KEY=, DEBUG=, ALLOWED_HOSTS=, CORS_ALLOWED_ORIGINS=
  .env                        (yours, not shared)
  places/
    apps.py
    here.py                   HereClient.autosuggest(text) -> list of suggestion dicts; raises HereError subclasses
    serializers.py            SuggestQuerySerializer (q), PlaceSerializer (id, label, lat, lon, timezone)
    views.py                  SuggestPlacesView (APIView): validate -> cache -> here -> respond
    urls.py                   path("suggest/", ...)
    tests.py
  weather_aware/
    settings.py               add rest_framework + corsheaders + places, CorsMiddleware, read .env, HERE_API_KEY, REST_FRAMEWORK, CACHES
    urls.py                   path("api/places/", include("places.urls"))
```

`here.py` is the only module that knows about HERE: URL, parameters, response mapping and error translation. The view never sees HERE's format. The later plan-trip work can add routing calls beside it.

`REST_FRAMEWORK` settings: JSON renderer only (no browsable API in the contract), no authentication classes, the anonymous throttle rate.

## Frontend change (small, so the real endpoint can be tried)

`frontend_weather/src/mocks/handlers.ts` currently fakes both requests. Add a `VITE_MOCK_PLACES` flag (default `true`): when `false`, the suggest handler is left out, so that request falls through to the Vite proxy and reaches Django, while plan-trip stays mocked. The mock trip generator already works with any place that has coordinates and a time zone. Nothing else in the frontend changes.

## Build order

1. `pip install` the five packages into `venv`, write `requirements.txt`.
2. `startapp places`; settings (`.env` loading, DRF, cache, installed apps); root URL include.
3. `here.py` client (httpx + tenacity) with mapping and error classes.
4. Serializers, view, URL.
5. Tests.
6. `VITE_MOCK_PLACES` flag in the frontend mock handlers.
7. Update `CLAUDE.md` (backend commands, `.env`) and add `docs/backend-places-plan.md`.

## Verification

- `..\venv\Scripts\python.exe manage.py test places` passes. Tests give the client an `httpx.MockTransport`, so they need no key and no network:
  - a normal HERE payload maps to the contract shape, and the outgoing request carries `in=countryCode:USA`, `show=tz`, `resultTypes=address`;
  - items without `position` or `timeZone` are dropped;
  - short or missing `q` returns an empty list without calling HERE;
  - the same text twice calls HERE once (cache);
  - missing key → 503, HERE 401 → 502 with a single attempt, HERE 429 → 503, each with a `detail` and no key in the body;
  - a timeout or 5xx is tried 3 times in total, then answers 504 or 502; one failure followed by a success returns the suggestions;
  - a request with `Origin: http://localhost:5173` gets the CORS allow header.
- `manage.py check` is clean.
- `manage.py runserver`, then `curl "http://localhost:8000/api/places/suggest/?q=den"`:
  - without a key: the 503 "not configured" body;
  - once you add a key to `.env`: real suggestions with `lat`, `lon` and `timezone`.
- With a key: run the frontend with `VITE_MOCK_PLACES=false`, type "den" in Origin, and confirm real HERE suggestions appear, the Network tab shows the request answered by Django, and a full plan (still mocked) works from a real address.
- Frontend `npm run lint` and `npm run build` still pass.

The last two checks that need a real key I cannot run until you have created one; everything else I will run myself.

## Status

Built as planned. The 14 tests pass, and the running server answers without a key with the 503 "not configured" body and the CORS header. Still to do once a HERE key is in `weather_aware/.env`: the two checks against the real HERE service.

## Fix after the first live call (HERE `resultTypes`)

The original plan sent `resultTypes=address`. The live Autosuggest endpoint rejected it with a 400, and then rejected every other value tried (`houseNumber`, `street`, `locality`, `place`, `categoryQuery` and more). The parameter is no longer sent. Instead `places/here.py` keeps only items whose `resultType` is an address type (`houseNumber`, `street`, `intersection`, `addressBlock`, `locality`, `postalCodePoint`), asks HERE for 20 and returns the first 8.

HERE's own explanation of a 4xx (`title`, `cause`, `action`) is now logged, so this kind of error is visible without debugging prints.

Checked against the real service: `den`, `1600 pennsylvania ave` and `80202` each return 200 with coordinates and a time zone, and the frontend with `VITE_MOCK_PLACES=false` shows the real suggestions. 17 tests pass.
