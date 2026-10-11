import Box from '@mui/material/Box'
import Paper from '@mui/material/Paper'
import Stack from '@mui/material/Stack'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import Typography from '@mui/material/Typography'
import { useState } from 'react'
import type { TripPlan } from './api/schemas'
import { ErrorAlert } from './components/ErrorAlert'
import { ErrorBoundary } from './components/ErrorBoundary'
import { LoadingOverlay } from './components/LoadingOverlay'
import { useUnits } from './context/UnitsContext'
import { RouteMap } from './features/map/RouteMap'
import { RouteCardList } from './features/routes/RouteCardList'
import { WarningBanner } from './features/routes/WarningBanner'
import { ForecastSlider } from './features/timeline/ForecastSlider'
import { TripForm } from './features/trip-form/TripForm'
import { usePlanTrip } from './hooks/usePlanTrip'

const PANEL_WIDTH = 400

function App() {
  const { plan, isLoading, error, submit, retry } = usePlanTrip()
  const { temperatureUnit, setTemperatureUnit } = useUnits()

  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null)
  const [hour, setHour] = useState(0)
  const [showTrucks, setShowTrucks] = useState(false)

  // A new plan starts from its recommended route at departure time.
  const [shownPlan, setShownPlan] = useState<TripPlan | null>(null)
  if (plan !== shownPlan) {
    setShownPlan(plan)
    setSelectedRouteId(plan?.recommended_route_id ?? plan?.routes[0]?.id ?? null)
    setHour(0)
  }

  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: { xs: 'column', md: 'row' },
        height: { md: '100dvh' },
        minHeight: '100dvh',
      }}
    >
      <Box
        component="aside"
        sx={{
          width: { md: PANEL_WIDTH },
          flexShrink: 0,
          overflowY: { md: 'auto' },
          borderRight: { md: 1 },
          borderBottom: { xs: 1, md: 0 },
          borderColor: 'divider',
          bgcolor: 'background.default',
          p: 2,
        }}
      >
        <Stack spacing={2}>
          <Stack direction="row" sx={{ justifyContent: 'space-between', alignItems: 'center' }}>
            <Typography variant="h1">Safe route planner</Typography>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={temperatureUnit}
              onChange={(_, unit) => unit !== null && setTemperatureUnit(unit)}
              aria-label="Temperature unit"
            >
              <ToggleButton value="F" sx={{ px: 1.25, py: 0.25 }}>
                °F
              </ToggleButton>
              <ToggleButton value="C" sx={{ px: 1.25, py: 0.25 }}>
                °C
              </ToggleButton>
            </ToggleButtonGroup>
          </Stack>

          <Paper variant="outlined" sx={{ p: 2 }}>
            <TripForm onSubmit={submit} isLoading={isLoading} serverFieldErrors={error?.fieldErrors} />
          </Paper>

          {error && !isLoading && (
            <ErrorAlert
              message={error.message}
              // No Retry for problems the driver has to fix first (bad input, no route).
              onRetry={error.retryable ? retry : null}
              retrying={isLoading}
            />
          )}

          {plan && (
            <>
              <WarningBanner warnings={plan.warnings} />
              <RouteCardList
                plan={plan}
                selectedRouteId={selectedRouteId}
                onSelectRoute={setSelectedRouteId}
              />
            </>
          )}
        </Stack>
      </Box>

      <Box
        component="main"
        sx={{
          // Phones: a fixed-height map under the panel. Desktop: fill the rest.
          flex: { xs: 'none', md: 1 },
          height: { xs: '85dvh', md: 'auto' },
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box sx={{ position: 'relative', flex: 1, minHeight: 0 }}>
          <ErrorBoundary title="The map could not be displayed">
            <RouteMap
              plan={plan}
              selectedRouteId={selectedRouteId}
              onSelectRoute={setSelectedRouteId}
              hour={hour}
              showTrucks={showTrucks}
            />
          </ErrorBoundary>

          {!plan && !isLoading && (
            <Paper
              elevation={2}
              sx={{
                position: 'absolute',
                top: 12,
                left: '50%',
                transform: 'translateX(-50%)',
                px: 2,
                py: 1,
                zIndex: 2,
                whiteSpace: 'nowrap',
              }}
            >
              <Typography variant="body2">Plan a trip to see routes and weather risk</Typography>
            </Paper>
          )}
          {isLoading && <LoadingOverlay message="Checking weather along your routes…" />}
        </Box>

        {plan && (
          <ForecastSlider
            hour={hour}
            onHourChange={setHour}
            // Hour 0 of the forecast is the departure rounded down to the hour.
            startTime={plan.heatmap.hour0}
            timezone={plan.origin.timezone}
            showTrucks={showTrucks}
            onShowTrucksChange={setShowTrucks}
          />
        )}
      </Box>
    </Box>
  )
}

export default App
