import Box from '@mui/material/Box'
import Tooltip from '@mui/material/Tooltip'
import Typography from '@mui/material/Typography'
import { RISK_LEVELS, type Route } from '../../api/schemas'
import { RISK_COLORS, RISK_LABELS, UNKNOWN_RISK_COLOR } from '../../theme'
import { formatMiles } from '../../utils/format'

export function RiskMilesBar({ milesByLevel }: { milesByLevel: Route['miles_by_level'] }) {
  const segments = [
    ...RISK_LEVELS.map((level) => ({
      key: level as string,
      label: RISK_LABELS[level],
      color: RISK_COLORS[level],
      miles: milesByLevel[level],
    })),
    // Miles with no forecast.
    { key: 'unknown', label: 'No data', color: UNKNOWN_RISK_COLOR, miles: milesByLevel.unknown },
  ]

  const shown = segments.filter((segment) => segment.miles >= 0.5)
  const summary = shown.map((segment) => `${segment.label} ${formatMiles(segment.miles)}`).join(' · ')

  return (
    <Box>
      <Box
        role="img"
        aria-label={`Miles at each risk level: ${summary}`}
        sx={{ display: 'flex', gap: '2px', height: 10, borderRadius: 1, overflow: 'hidden' }}
      >
        {shown.map((segment) => (
          <Tooltip key={segment.key} title={`${segment.label}: ${formatMiles(segment.miles)}`} arrow>
            <Box sx={{ flexGrow: segment.miles, flexBasis: 0, minWidth: 3, bgcolor: segment.color }} />
          </Tooltip>
        ))}
      </Box>
      <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'text.secondary' }}>
        {summary}
      </Typography>
    </Box>
  )
}
