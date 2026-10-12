# A separate switch for the weather simulator

## Context

The weather simulator is tied to Django's `DEBUG`: it is offered only when `DEBUG=True`. You want to use it on the production site too, and `DEBUG` must stay off there. This gives the simulator its own switch.

## The switch

A new environment variable on Django:

```
ALLOW_WEATHER_SIMULATION=True
```

- **Set to `True` or `False`:** that value decides, whatever `DEBUG` is.
- **Not set:** it follows `DEBUG`, as today. Local development keeps working with no change to your `.env`, and a production server without the variable stays off.

Nothing else decides it. The frontend needs no variable: it already shows the selector only when Django's scenario list is not empty.

## Changes

- **`weather_aware/weather_aware/settings.py`**: `ALLOW_WEATHER_SIMULATION = env.bool('ALLOW_WEATHER_SIMULATION', default=DEBUG)`.
- **`weather_aware/.env.example`**: the new variable, with a comment.
- **`weather_aware/trips/serializers.py`**: the refusal message "Weather simulation is only available in development." becomes "Weather simulation is turned off on this server."
- **`frontend_weather/src/components/trip-form/TripForm.tsx`**: the selector label "Simulate weather (development)" becomes "Simulate weather (test)", since it can now appear in production.
- **Comments** in `planner.py`, `serializers.py`, and the "development only" wording in `README.md` and `CLAUDE.md`, updated to say the simulator is controlled by its own switch.
- **Tests** (`trips/tests/test_simulator.py`): they already set the switch directly, so they keep passing; the expected refusal message is updated.

The plan is saved as `docs/simulator-switch-plan.md`.

## What stays the same, and one thing to know

- Every simulated plan still shows the blue "Simulated weather … Not a real forecast" banner first.
- With the switch on in production, **any visitor** sees the selector and can plan with made-up weather. The banner is the only thing telling them apart from a real forecast. If you later want it limited to you, that needs a password or a secret link, which is not part of this change.

## On Render

Add `ALLOW_WEATHER_SIMULATION=True` to the service's environment and let it redeploy. Leave `DEBUG=False`.

## Verification

- `manage.py test` passes; frontend `npm run lint` and `npm run build` pass.
- Locally, three runs of the settings with different environments, checking the scenario list each time:
  - `DEBUG=False` + `ALLOW_WEATHER_SIMULATION=True` → scenarios listed (the production case).
  - `DEBUG=True` + `ALLOW_WEATHER_SIMULATION=False` → empty list.
  - `DEBUG=True`, variable not set → scenarios listed (today's behaviour).
- In a browser against a local Django started with `DEBUG=False` and the switch on: the selector appears, a simulated plan shows the banner, and "Real forecast" does not.
- After you deploy with the variable set: `https://weather-aware-bsu9.onrender.com/api/trips/weather-scenarios/` returns the scenarios.

The changes go on the current local branch `nws-weather`, alongside the uncommitted NWS work. Nothing is committed unless you ask.
