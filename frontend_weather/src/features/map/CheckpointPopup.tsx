// @packages
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { Popup } from "react-map-gl/maplibre";

// @scripts
import type { Checkpoint, RiskLevel } from "../../api/schemas";
import { useUnits } from "../../context/UnitsContext";
import { RISK_COLORS, RISK_LABELS, UNKNOWN_RISK_COLOR } from "../../theme";
import {
  formatLocalTime,
  formatRain,
  formatSnow,
  formatTemperature,
} from "../../utils/format";

type Props = {
  checkpoint: Checkpoint;
  onClose: () => void;
};

function ConditionRow({
  label,
  value,
  level,
}: {
  label: string;
  value: string;
  level: RiskLevel;
}) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
      <Typography variant="body2" sx={{ color: "text.secondary", width: 44 }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 600, flex: 1 }}>
        {value}
      </Typography>
      <Box
        aria-hidden
        sx={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          bgcolor: RISK_COLORS[level],
          flexShrink: 0,
        }}
      />
      <Typography variant="caption" sx={{ width: 62 }}>
        {RISK_LABELS[level]}
      </Typography>
    </Box>
  );
}

function Detail({ label, text }: { label: string; text: string }) {
  return (
    <Box>
      <Typography
        variant="caption"
        sx={{ color: "text.secondary", display: "block" }}
      >
        {label}
      </Typography>
      <Typography variant="body2">{text}</Typography>
    </Box>
  );
}

export function CheckpointPopup({ checkpoint, onClose }: Props) {
  const { temperatureUnit } = useUnits();
  const { weather, levels, risk_level: risk } = checkpoint;
  const color = risk ? RISK_COLORS[risk] : UNKNOWN_RISK_COLOR;

  return (
    <Popup
      longitude={checkpoint.lon}
      latitude={checkpoint.lat}
      onClose={onClose}
      closeOnClick={false}
      offset={12}
      maxWidth="320px"
    >
      <Stack spacing={1} sx={{ minWidth: 240, pr: 1 }}>
        <Box>
          <Typography variant="subtitle2">
            Mile {Math.round(checkpoint.mile)}
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary" }}>
            ETA {formatLocalTime(checkpoint.eta, checkpoint.timezone)}
          </Typography>
        </Box>

        <Chip
          size="small"
          label={risk ? `${RISK_LABELS[risk]} risk` : "Risk unknown"}
          sx={(theme) => ({
            alignSelf: "flex-start",
            bgcolor: color,
            color: theme.palette.getContrastText(color),
            fontWeight: 600,
          })}
        />

        {weather && levels ? (
          <Box>
            <ConditionRow
              label="Wind"
              value={`gusts ${Math.round(weather.wind_gust_mph)} mph`}
              level={levels.wind}
            />
            <ConditionRow
              label="Rain"
              value={formatRain(weather.rain_in, temperatureUnit)}
              level={levels.rain}
            />
            <ConditionRow
              label="Snow"
              value={formatSnow(weather.snow_in, temperatureUnit)}
              level={levels.snow}
            />
            <Typography
              variant="caption"
              sx={{ color: "text.secondary", display: "block", mt: 0.5 }}
            >
              Sustained wind {Math.round(weather.wind_speed_mph)} mph
              {weather.temperature_c !== null &&
                ` · ${formatTemperature(weather.temperature_c, temperatureUnit)}`}
            </Typography>
          </Box>
        ) : (
          <Typography variant="body2">
            No weather forecast for this checkpoint.
          </Typography>
        )}

        {checkpoint.deciding_condition && (
          <Detail
            label="Deciding condition"
            text={checkpoint.deciding_condition}
          />
        )}
        {weather && (
          <Detail
            label="Load rule applied"
            text={checkpoint.load_rule ?? "None for this cargo weight"}
          />
        )}
      </Stack>
    </Popup>
  );
}
