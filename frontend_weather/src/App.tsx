// @packages
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useState } from "react";

// @components
import { ErrorAlert } from "./components/ErrorAlert";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LoadingOverlay } from "./components/LoadingOverlay";
import { RouteMap } from "./features/map/RouteMap";
import { RouteCardList } from "./features/routes/RouteCardList";
import { WarningBanner } from "./features/routes/WarningBanner";
import { ForecastSlider } from "./features/timeline/ForecastSlider";
import { TripForm } from "./features/trip-form/TripForm";

// @scripts
import type { TripPlan } from "./api/schemas";
import { useUnits } from "./context/UnitsContext";
import { usePlanTrip } from "./hooks/usePlanTrip";

const PANEL_WIDTH = 400;

function App() {
  const { plan, isLoading, error, submit, retry } = usePlanTrip();
  const { temperatureUnit, setTemperatureUnit } = useUnits();

  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [hour, setHour] = useState(0);
  const [showTrucks, setShowTrucks] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);

  const [shownPlan, setShownPlan] = useState<TripPlan | null>(null);
  if (plan !== shownPlan) {
    setShownPlan(plan);
    setSelectedRouteId(
      plan?.recommended_route_id ?? plan?.routes[0]?.id ?? null,
    );
    setHour(0);
  }

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: { xs: "column", md: "row" },
        height: { md: "100dvh" },
        minHeight: "100dvh",
      }}
    >
      <Box
        component="aside"
        id="trip-panel"
        sx={{
          display: panelOpen ? "block" : "none",
          width: { md: PANEL_WIDTH },
          flexShrink: 0,
          overflowY: { md: "auto" },
          borderRight: { md: 1 },
          borderBottom: { xs: 1, md: 0 },
          borderColor: "divider",
          bgcolor: "background.default",
          p: 2,
        }}
      >
        <Stack spacing={2}>
          <Stack
            direction="row"
            sx={{ justifyContent: "space-between", alignItems: "center" }}
          >
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
            <TripForm
              onSubmit={submit}
              isLoading={isLoading}
              serverFieldErrors={error?.fieldErrors}
            />
          </Paper>

          {error && !isLoading && (
            <ErrorAlert
              message={error.message}
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
          flex: { xs: "none", md: 1 },
          height: { xs: panelOpen ? "85dvh" : "100dvh", md: "auto" },
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <Box sx={{ position: "relative", flex: 1, minHeight: 0 }}>
          <ErrorBoundary title="The map could not be displayed">
            <RouteMap
              plan={plan}
              selectedRouteId={selectedRouteId}
              onSelectRoute={setSelectedRouteId}
              hour={hour}
              showTrucks={showTrucks}
            />
          </ErrorBoundary>

          <Tooltip
            title={panelOpen ? "Hide panel" : "Show panel"}
            placement="right"
          >
            <ButtonBase
              onClick={() => setPanelOpen(!panelOpen)}
              aria-label={panelOpen ? "Hide panel" : "Show panel"}
              aria-expanded={panelOpen}
              aria-controls="trip-panel"
              sx={{
                position: "absolute",
                left: 0,
                top: "50%",
                transform: "translateY(-50%)",
                zIndex: 6,
                width: 24,
                height: 56,
                bgcolor: "background.paper",
                borderRadius: "0 8px 8px 0",
                boxShadow: 2,
                "&:hover": { bgcolor: "grey.100" },
              }}
            >
              {panelOpen ? (
                <ChevronLeftIcon fontSize="small" />
              ) : (
                <ChevronRightIcon fontSize="small" />
              )}
            </ButtonBase>
          </Tooltip>

          {!plan && !isLoading && (
            <Paper
              elevation={2}
              sx={{
                position: "absolute",
                top: 12,
                left: "50%",
                transform: "translateX(-50%)",
                px: 2,
                py: 1,
                zIndex: 2,
                whiteSpace: "nowrap",
              }}
            >
              <Typography variant="body2">
                Plan a trip to see routes and weather risk
              </Typography>
            </Paper>
          )}
          {isLoading && (
            <LoadingOverlay message="Checking weather along your routes…" />
          )}
        </Box>

        {plan && (
          <ForecastSlider
            hour={hour}
            onHourChange={setHour}
            startTime={plan.heatmap.hour0}
            timezone={plan.origin.timezone}
            showTrucks={showTrucks}
            onShowTrucksChange={setShowTrucks}
          />
        )}
      </Box>
    </Box>
  );
}

export default App;
