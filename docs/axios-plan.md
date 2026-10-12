# Replace fetch with Axios in the frontend

## Context

The frontend calls Django through the browser's `fetch`. You want Axios instead. Only the frontend changes; Django and the API contract stay as they are.

All HTTP goes through one function, `apiFetch` in `frontend_weather/src/api/client.ts`. It is the only place `fetch` is called, so the change is small: that file, its two callers, and the docs.

## What changes

**`frontend_weather/package.json`** — add `axios` (current 1.x).

**`src/api/client.ts`** — rewritten on Axios, same behaviour:

- One Axios instance: `baseURL` from `VITE_API_BASE_URL` (default `/api`), `timeout` 60 s, `Accept: application/json`.
- `apiFetch` is renamed `apiRequest(path, schema, options)`, where options are Axios's own: `method`, `params`, `data`, `signal`.
- The zod check of every response stays exactly as now.
- `ApiError` (status, `fieldErrors`, `retryable`) stays unchanged, so `usePlanTrip.ts` and the components need no change.
- Errors map to the same messages as today:

| Axios reports | Driver sees |
|---|---|
| Cancelled (`axios.isCancel`) | Nothing; rethrown so TanStack Query drops it |
| Timeout (`ECONNABORTED` / `ETIMEDOUT`) | "The server took too long to answer. Please try again." |
| A response with an error status | Django's `detail`, `field_errors`, `retryable`; or "The server returned an error (500)." |
| No response | "Could not reach the server. Check your connection and try again." |
| A response that fails the zod schema | "The server sent a response this app does not understand." |

**`src/api/places.ts`** — pass `params: { q: text }` instead of building the query string by hand.

**`src/api/trips.ts`** — pass `data: request` instead of `JSON.stringify`; Axios sets the JSON header itself.

**`CLAUDE.md`** — add Axios to the stack line. The plan is saved as `docs/axios-plan.md`.

Not changed: the mock backend. Mock Service Worker intercepts Axios requests the same way it intercepts `fetch`, so `src/mocks/` stays as it is.

## Verification

- `npm run lint` and `npm run build` pass.
- In a browser, with the mock backend:
  - Typing in Origin shows suggestions, and fast typing cancels earlier requests without an error.
  - Planning a trip shows routes.
  - Destination "Errorville" shows the server's error message with Retry.
  - `?mockDelay=10000` keeps the loading state, and a second submit cancels the first.
- In a browser against Django (`VITE_MOCK_TRIPS=false`): one real plan, and one with 200,000 lb cargo to confirm the field error still appears under the weight field.
- With Django stopped: "Could not reach the server" appears.

The work stays uncommitted on the current branch (`remove-temperature-truck-tracking`, PR #5 still open) unless you ask for a branch and pull request.
