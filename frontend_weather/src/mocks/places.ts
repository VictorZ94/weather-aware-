import type { Place } from '../api/schemas'

// Destinations that make the fake Django return a specific situation.
export const SCENARIO = {
  serverError: 'errorville-xx',
  noTravel: 'blizzard-pass-wy',
  fewerRoutes: 'two-roads-ne',
  missingWeather: 'deadzone-nv',
} as const

export const MOCK_PLACES: Place[] = [
  { id: 'denver-co', label: 'Denver, CO', lat: 39.7392, lon: -104.9903, timezone: 'America/Denver' },
  { id: 'chicago-il', label: 'Chicago, IL', lat: 41.8781, lon: -87.6298, timezone: 'America/Chicago' },
  { id: 'dallas-tx', label: 'Dallas, TX', lat: 32.7767, lon: -96.797, timezone: 'America/Chicago' },
  { id: 'houston-tx', label: 'Houston, TX', lat: 29.7604, lon: -95.3698, timezone: 'America/Chicago' },
  { id: 'kansas-city-mo', label: 'Kansas City, MO', lat: 39.0997, lon: -94.5786, timezone: 'America/Chicago' },
  { id: 'omaha-ne', label: 'Omaha, NE', lat: 41.2565, lon: -95.9345, timezone: 'America/Chicago' },
  { id: 'minneapolis-mn', label: 'Minneapolis, MN', lat: 44.9778, lon: -93.265, timezone: 'America/Chicago' },
  { id: 'st-louis-mo', label: 'St. Louis, MO', lat: 38.627, lon: -90.1994, timezone: 'America/Chicago' },
  { id: 'memphis-tn', label: 'Memphis, TN', lat: 35.1495, lon: -90.049, timezone: 'America/Chicago' },
  { id: 'nashville-tn', label: 'Nashville, TN', lat: 36.1627, lon: -86.7816, timezone: 'America/Chicago' },
  { id: 'atlanta-ga', label: 'Atlanta, GA', lat: 33.749, lon: -84.388, timezone: 'America/New_York' },
  { id: 'indianapolis-in', label: 'Indianapolis, IN', lat: 39.7684, lon: -86.1581, timezone: 'America/Indiana/Indianapolis' },
  { id: 'columbus-oh', label: 'Columbus, OH', lat: 39.9612, lon: -82.9988, timezone: 'America/New_York' },
  { id: 'new-york-ny', label: 'New York, NY', lat: 40.7128, lon: -74.006, timezone: 'America/New_York' },
  { id: 'salt-lake-city-ut', label: 'Salt Lake City, UT', lat: 40.7608, lon: -111.891, timezone: 'America/Denver' },
  { id: 'albuquerque-nm', label: 'Albuquerque, NM', lat: 35.0844, lon: -106.6504, timezone: 'America/Denver' },
  { id: 'phoenix-az', label: 'Phoenix, AZ', lat: 33.4484, lon: -112.074, timezone: 'America/Phoenix' },
  { id: 'las-vegas-nv', label: 'Las Vegas, NV', lat: 36.1699, lon: -115.1398, timezone: 'America/Los_Angeles' },
  { id: 'los-angeles-ca', label: 'Los Angeles, CA', lat: 34.0522, lon: -118.2437, timezone: 'America/Los_Angeles' },
  { id: 'seattle-wa', label: 'Seattle, WA', lat: 47.6062, lon: -122.3321, timezone: 'America/Los_Angeles' },
  { id: 'billings-mt', label: 'Billings, MT', lat: 45.7833, lon: -108.5007, timezone: 'America/Denver' },
  { id: 'cheyenne-wy', label: 'Cheyenne, WY', lat: 41.14, lon: -104.8202, timezone: 'America/Denver' },
  // Scenario places.
  { id: SCENARIO.serverError, label: 'Errorville, XX (mock: server error)', lat: 37.0, lon: -95.7, timezone: 'America/Chicago' },
  { id: SCENARIO.noTravel, label: 'Blizzard Pass, WY (mock: no travel)', lat: 43.0, lon: -109.7, timezone: 'America/Denver' },
  { id: SCENARIO.fewerRoutes, label: 'Two Roads, NE (mock: 2 routes)', lat: 41.13, lon: -100.77, timezone: 'America/Chicago' },
  { id: SCENARIO.missingWeather, label: 'Deadzone, NV (mock: missing weather)', lat: 39.5, lon: -116.9, timezone: 'America/Los_Angeles' },
]
