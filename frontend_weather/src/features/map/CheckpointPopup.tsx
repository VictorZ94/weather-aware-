import Box from '@mui/material/Box'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { Popup } from 'react-map-gl/maplibre'
import type { Checkpoint } from '../../api/schemas'
import { useUnits } from '../../context/UnitsContext'
import { RISK_COLORS, RISK_LABELS, UNKNOWN_RISK_COLOR } from '../../theme'
import { formatLocalTime, formatRain, formatSnow, formatTemperature } from '../../utils/format'

type Props = {
  checkpoint: Checkpoint
  onClose: () => void
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 2 }}>
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600, textAlign: 'right' }}>
        {value}
      </Typography>
    </Box>
  )
}

export function CheckpointPopup({ checkpoint, onClose }: Props) {
  const { temperatureUnit } = useUnits()
  const { weather, risk_level: risk } = checkpoint
  const color = risk ? RISK_COLORS[risk] : UNKNOWN_RISK_COLOR

  return (
    <Popup
      longitude={checkpoint.lon}
      latitude={checkpoint.lat}
      onClose={onClose}
      closeOnClick={false}
      offset={12}
      maxWidth="300px"
    >
      <Stack spacing={1} sx={{ minWidth: 220, pr: 1 }}>
        <Box>
          <Typography variant="subtitle2">Mile {Math.round(checkpoint.mile)}</Typography>
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            ETA {formatLocalTime(checkpoint.eta, checkpoint.timezone)}
          </Typography>
        </Box>

        <Chip
          size="small"
          label={risk ? `${RISK_LABELS[risk]} risk` : 'Risk unknown'}
          sx={(theme) => ({
            alignSelf: 'flex-start',
            bgcolor: color,
            color: theme.palette.getContrastText(color),
            fontWeight: 600,
          })}
        />

        {weather ? (
          <Box>
            <Row label="Conditions" value={`${weather.condition}, ${formatTemperature(weather.temperature_c, temperatureUnit)}`} />
            <Row label="Wind" value={`${weather.wind_speed_mph} mph, gusts ${weather.wind_gust_mph}`} />
            <Row label="Rain" value={formatRain(weather.rain_mm, temperatureUnit)} />
            <Row label="Snow" value={formatSnow(weather.snow_cm, temperatureUnit)} />
            <Row label="Visibility" value={`${weather.visibility_miles} mi`} />
          </Box>
        ) : (
          <Typography variant="body2">Weather unavailable for this checkpoint.</Typography>
        )}

        {checkpoint.deciding_condition && (
          <Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
              Deciding condition
            </Typography>
            <Typography variant="body2">{checkpoint.deciding_condition}</Typography>
          </Box>
        )}
        {checkpoint.load_rule && (
          <Box>
            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
              Load rule applied
            </Typography>
            <Typography variant="body2">{checkpoint.load_rule}</Typography>
          </Box>
        )}
      </Stack>
    </Popup>
  )
}
