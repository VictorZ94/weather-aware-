// @packages
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import Box from "@mui/material/Box";
import ButtonBase from "@mui/material/ButtonBase";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { useState } from "react";

// @components
import { ErrorAlert } from "./components/ErrorAlert";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { LoadingOverlay } from "./components/LoadingOverlay";
import { RouteMap } from "./components/map/RouteMap";
import { RouteCardList } from "./components/routes/RouteCardList";
import { WarningBanner } from "./components/routes/WarningBanner";
import { ForecastSlider } from "./components/timeline/ForecastSlider";
import { TripForm } from "./components/trip-form/TripForm";

// @scripts
import type { TripPlan } from "./api/schemas";
import { usePlanTrip } from "./hooks/usePlanTrip";

const PANEL_WIDTH = 400;

function App() {
  const { plan, isLoading, error, submit, retry } = usePlanTrip();

  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [hour, setHour] = useState(0);
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
          <Typography variant="h1">Safe route planner</Typography>

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
          />
        )}
      </Box>
    </Box>
  );
}

export default App;
