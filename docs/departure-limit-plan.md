# Limit the departure picker to 7 days ahead

## Context

The departure date picker lets the driver choose any future date. Forecasts only reach about 8 days, and Django already rejects a departure more than 7 days ahead, so a later date can only end in an error after submitting. The picker should not offer those days at all.

## The limit: 7 days

You said 7 or 8. I recommend **7**, because Django's own limit is 7 days (`MAX_DAYS_AHEAD` in `weather_aware/trips/serializers.py`); with 8 in the picker the last day would be selectable and then refused by the server. Nothing changes in Django.

## Changes (frontend only)

- **`frontend_weather/src/components/trip-form/tripSchema.ts`**
  - Add `MAX_DAYS_AHEAD = 7`, the one place the number lives in the frontend.
  - Add a check next to the existing "Departure cannot be in the past" one: a departure more than 7 days ahead gets the message "Departure can be at most 7 days ahead". It uses `wallClockInZone` like the past check, so it is measured in the origin's time zone, the same way Django measures it. This covers a date typed by hand into the field.
- **`frontend_weather/src/components/trip-form/TripForm.tsx`**
  - Give the `DateTimePicker` a `maxDateTime` of now + 7 days, beside the existing `disablePast`. Later days are greyed out in the calendar, and on the last day the later hours are greyed out too.

One small edge: the calendar greys out days by the browser's clock, while the real limit is in the origin's time zone. Across time zones the last few hours can differ; the form check and Django decide in those cases.

The plan is saved as `docs/departure-limit-plan.md`.

## Verification

- `npm run lint` and `npm run build` pass (the build type-checks the picker prop).
- In a browser:
  - Open the calendar: days after today + 7 are greyed out and cannot be clicked; past days still are.
  - Type a date 10 days ahead into the field and submit: "Departure can be at most 7 days ahead" appears under it and no request is sent.
  - A date 6 days ahead plans normally.

The change goes on a new branch from `main`. Your uncommitted edit in `src/api/client.ts` is left as it is. Nothing is committed unless you ask.
