import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { RISK_LEVELS } from '../../api/schemas'
import { RISK_COLORS, RISK_LABELS, UNKNOWN_RISK_COLOR } from '../../theme'

function Swatch({ color, hollow = false }: { color: string; hollow?: boolean }) {
  return (
    <Box
      sx={{
        width: 12,
        height: 12,
        borderRadius: '50%',
        boxSizing: 'border-box',
        bgcolor: hollow ? '#ffffff' : color,
        border: hollow ? `2px solid ${color}` : 'none',
      }}
    />
  )
}

// `intervalMiles` is only known once a trip has been planned.
export function RiskLegend({ intervalMiles }: { intervalMiles: number | null }) {
  return (
    <Paper
      elevation={2}
      sx={{ position: 'absolute', top: 12, left: 12, zIndex: 2, px: 1.5, py: 1, maxWidth: 180 }}
    >
      <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', mb: 0.5 }}>
        Weather risk
      </Typography>
      <Stack spacing={0.25}>
        {RISK_LEVELS.map((level) => (
          <Stack key={level} direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Swatch color={RISK_COLORS[level]} />
            <Typography variant="caption">{RISK_LABELS[level]}</Typography>
          </Stack>
        ))}
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Swatch color={UNKNOWN_RISK_COLOR} hollow />
          <Typography variant="caption">No data</Typography>
        </Stack>
      </Stack>
      {intervalMiles !== null && (
        <Typography variant="caption" sx={{ display: 'block', mt: 0.75, color: 'text.secondary' }}>
          Weather sampled every {intervalMiles} mi
        </Typography>
      )}
    </Paper>
  )
}
