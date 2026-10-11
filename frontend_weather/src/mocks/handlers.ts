import { http, HttpResponse } from 'msw/http'
import { delay } from 'msw/utils/delay'
import type { TripPlanRequest } from '../api/schemas'
import { generateTrip } from './generateTrip'
import { MOCK_PLACES, SCENARIO } from './places'

// `?mockDelay=10000` in the page URL makes the plan request slow on purpose.
function planDelay(): number {
  const forced = Number(new URLSearchParams(window.location.search).get('mockDelay'))
  return forced > 0 ? forced : 1500 + Math.random() * 1500
}

// With VITE_MOCK_PLACES=false, suggestions come from the real Django endpoint
// (through the Vite /api proxy) while trip planning stays mocked.
const mockPlaces = import.meta.env.VITE_MOCK_PLACES !== 'false'

const suggestHandlers = [
  http.get('*/api/places/suggest/', async ({ request }) => {
    const text = (new URL(request.url).searchParams.get('q') ?? '').trim().toLowerCase()
    await delay(200 + Math.random() * 200)
    const suggestions = text
      ? MOCK_PLACES.filter((place) => place.label.toLowerCase().includes(text)).slice(0, 8)
      : []
    return HttpResponse.json({ suggestions })
  }),
]

// Same for trip planning with VITE_MOCK_TRIPS=false.
const mockTrips = import.meta.env.VITE_MOCK_TRIPS !== 'false'

const tripHandlers = [
  http.post('*/api/trips/plan/', async ({ request }) => {
    const body = (await request.json()) as TripPlanRequest
    await delay(planDelay())

    if (body.destination.id === SCENARIO.serverError) {
      return HttpResponse.json(
        { detail: 'The routing service is temporarily unavailable. Please try again.', retryable: true },
        { status: 500 },
      )
    }
    if (body.origin.id === body.destination.id) {
      return HttpResponse.json(
        {
          detail: 'The trip could not be planned.',
          field_errors: { destination: 'Destination must be different from the origin' },
          retryable: false,
        },
        { status: 422 },
      )
    }
    return HttpResponse.json(generateTrip(body))
  }),
]

export const handlers = [...(mockPlaces ? suggestHandlers : []), ...(mockTrips ? tripHandlers : [])]
