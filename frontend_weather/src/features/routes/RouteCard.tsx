// @packages
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { useEffect, useRef } from "react";

// @scripts
import { RISK_LEVELS, type Route } from "../../api/schemas";
import { RISK_COLORS, RISK_LABELS, UNKNOWN_RISK_COLOR } from "../../theme";
import {
  formatDuration,
  formatLocalTime,
  formatMiles,
} from "../../utils/format";
import { RecommendationBadge } from "./RecommendationBadge";
import { RiskMilesBar } from "./RiskMilesBar";

type Props = {
  route: Route;
  destinationTimezone: string;
  recommended: boolean;
  recommendationReason: string | null;
  selected: boolean;
  onSelect: () => void;
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Box>
      <Typography
        variant="caption"
        sx={{ color: "text.secondary", display: "block" }}
      >
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {value}
      </Typography>
    </Box>
  );
}

export function RouteCard({
  route,
  destinationTimezone,
  recommended,
  recommendationReason,
  selected,
  onSelect,
}: Props) {
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selected && window.matchMedia("(min-width: 900px)").matches) {
      cardRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selected]);

  const worst = route.worst_segment;
  const average = route.average_risk;
  const averageLevel =
    average === null ? null : RISK_LEVELS[Math.round(average)];
  const riskColor = averageLevel
    ? RISK_COLORS[averageLevel]
    : UNKNOWN_RISK_COLOR;
  const riskLabel =
    average === null || !averageLevel
      ? "Risk unknown"
      : `Avg risk ${average.toFixed(1)} · ${RISK_LABELS[averageLevel]}`;

  return (
    <Card
      ref={cardRef}
      variant="outlined"
      sx={{
        borderWidth: 2,
        borderColor: selected ? "primary.main" : "divider",
      }}
    >
      <CardActionArea onClick={onSelect} aria-pressed={selected} sx={{ p: 2 }}>
        <Stack spacing={1.5}>
          <Stack
            direction="row"
            sx={{
              justifyContent: "space-between",
              alignItems: "center",
              gap: 1,
            }}
          >
            <Typography variant="h2" component="h3">
              {route.name}
            </Typography>
            <Chip
              size="small"
              label={riskLabel}
              sx={(theme) => ({
                bgcolor: riskColor,
                color: theme.palette.getContrastText(riskColor),
                fontWeight: 600,
                flexShrink: 0,
              })}
            />
          </Stack>

          {recommended && <RecommendationBadge reason={recommendationReason} />}

          <Stack direction="row" spacing={3}>
            <Stat label="Distance" value={formatMiles(route.distance_miles)} />
            <Stat
              label="Duration"
              value={formatDuration(route.duration_minutes)}
            />
            <Stat
              label="Arrival"
              value={formatLocalTime(route.arrival_time, destinationTimezone)}
            />
          </Stack>

          <RiskMilesBar milesByLevel={route.miles_by_level} />

          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            {worst ? (
              <>
                <Box
                  component="span"
                  sx={{
                    display: "inline-block",
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    bgcolor: RISK_COLORS[worst.risk_level],
                    mr: 0.75,
                  }}
                />
                Worst: mi {Math.round(worst.from_mile)}–
                {Math.round(worst.to_mile)}, {worst.description.toLowerCase()}
              </>
            ) : average === null ? (
              "Risk not available: no weather forecast"
            ) : (
              "No stretch above Low risk"
            )}
          </Typography>
        </Stack>
      </CardActionArea>
    </Card>
  );
}
