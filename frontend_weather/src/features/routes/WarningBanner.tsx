import Alert from '@mui/material/Alert'
import Stack from '@mui/material/Stack'
import type { TripWarning } from '../../api/schemas'

// The plan succeeded, but Django flagged something the driver should know.
export function WarningBanner({ warnings }: { warnings: TripWarning[] }) {
  if (warnings.length === 0) return null
  return (
    <Stack spacing={1}>
      {warnings.map((warning) => (
        <Alert
          key={warning.code}
          severity={warning.code === 'no_travel_all_routes' ? 'error' : 'warning'}
        >
          {warning.message}
        </Alert>
      ))}
    </Stack>
  )
}
