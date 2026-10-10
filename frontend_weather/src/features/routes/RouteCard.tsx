import Box from '@mui/material/Box'
import Card from '@mui/material/Card'
import CardActionArea from '@mui/material/CardActionArea'
import Chip from '@mui/material/Chip'
import Stack from '@mui/material/Stack'
import Typography from '@mui/material/Typography'
import { useEffect, useRef } from 'react'
import type { Route } from '../../api/schemas'
import { RISK_COLORS, RISK_LABELS } from '../../theme'
import { formatDuration, formatLocalTime, formatMiles } from '../../utils/format'
import { RecommendationBadge } from './RecommendationBadge'
import { RiskMilesBar } from './RiskMilesBar'

type Props = {
  route: Route
  destinationTimezone: string
  recommended: boolean
  recommendationReason: string | null
  selected: boolean
  onSelect: () => void
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {value}
      </Typography>
    </Box>
  )
}

export function RouteCard({
  route,
  destinationTimezone,
  recommended,
  recommendationReason,
  selected,
  onSelect,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null)

  // Selecting a line on the map brings its card into view. Not on phones,
  // where that would scroll the map itself off screen.
  useEffect(() => {
    if (selected && window.matchMedia('(min-width: 900px)').matches) {
      cardRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [selected])

  const worst = route.worst_segment
  const riskColor = RISK_COLORS[route.average_risk]

  return (
    <Card
      ref={cardRef}
      variant="outlined"
      sx={{
        borderWidth: 2,
        borderColor: selected ? 'primary.main' : 'divider',
      }}
    >
      <CardActionArea onClick={onSelect} aria-pressed={selected} sx={{ p: 2 }}>
        <Stack spacing={1.5}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center', gap: 1 }}>
            <Typography variant="h2" component="h3">
              {route.name}
            </Typography>
            <Chip
              size="small"
              label={`${RISK_LABELS[route.average_risk]} risk`}
              sx={(theme) => ({
                bgcolor: riskColor,
                color: theme.palette.getContrastText(riskColor),
                fontWeight: 600,
              })}
            />
          </Stack>

          {recommended && <RecommendationBadge reason={recommendationReason} />}

          <Stack direction="row" spacing={3}>
            <Stat label="Distance" value={formatMiles(route.distance_miles)} />
            <Stat label="Duration" value={formatDuration(route.duration_minutes)} />
            <Stat label="Arrival" value={formatLocalTime(route.arrival_time, destinationTimezone)} />
          </Stack>

          <RiskMilesBar milesByLevel={route.miles_by_level} distanceMiles={route.distance_miles} />

          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {worst ? (
              <>
                <Box
                  component="span"
                  sx={{
                    display: 'inline-block',
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    bgcolor: RISK_COLORS[worst.risk_level],
                    mr: 0.75,
                  }}
                />
                Worst: mi {Math.round(worst.from_mile)}–{Math.round(worst.to_mile)},{' '}
                {worst.description.toLowerCase()}
              </>
            ) : (
              'No risky segments on this route'
            )}
          </Typography>
        </Stack>
      </CardActionArea>
    </Card>
  )
}
