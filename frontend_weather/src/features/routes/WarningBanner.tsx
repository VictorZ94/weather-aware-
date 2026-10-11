import Alert from '@mui/material/Alert'
import Stack from '@mui/material/Stack'
import type { TripWarning } from '../../api/schemas'

const SEVERITY: Partial<Record<TripWarning['code'], 'error' | 'info'>> = {
  no_travel_all_routes: 'error',
  simulated_weather: 'info',
}

// The plan succeeded, but Django flagged something the driver should know.
export function WarningBanner({ warnings }: { warnings: TripWarning[] }) {
  if (warnings.length === 0) return null
  return (
    <Stack spacing={1}>
      {warnings.map((warning, index) => (
        <Alert
          // route_notice can appear several times, so the code alone is not unique.
          key={`${warning.code}-${index}`}
          severity={SEVERITY[warning.code] ?? 'warning'}
        >
          {warning.message}
        </Alert>
      ))}
    </Stack>
  )
}
