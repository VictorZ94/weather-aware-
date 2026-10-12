// @packages
import Paper from "@mui/material/Paper";
import Slider from "@mui/material/Slider";
import Typography from "@mui/material/Typography";

// @scripts
import { formatLocalTime } from "../../utils/format";

const MAX_HOURS = 48;
const MARKS = [0, 12, 24, 36, 48].map((value) => ({
  value,
  label: `+${value} h`,
}));

type Props = {
  hour: number;
  onHourChange: (hour: number) => void;
  startTime: string;
  timezone: string;
};

export function ForecastSlider({
  hour,
  onHourChange,
  startTime,
  timezone,
}: Props) {
  const timeAt = (offset: number) =>
    formatLocalTime(
      new Date(Date.parse(startTime) + offset * 3_600_000).toISOString(),
      timezone,
    );

  return (
    <Paper
      square
      elevation={3}
      sx={{ px: { xs: 3, md: 4 }, pt: 1.5, pb: 1, zIndex: 3 }}
    >
      <Typography variant="body2">
        Risk forecast for{" "}
        <Typography component="span" variant="body2" sx={{ fontWeight: 700 }}>
          +{hour} h · {timeAt(hour)}
        </Typography>
      </Typography>
      <Slider
        value={hour}
        onChange={(_, value) => onHourChange(value)}
        min={0}
        max={MAX_HOURS}
        step={1}
        marks={MARKS}
        valueLabelDisplay="auto"
        valueLabelFormat={timeAt}
        aria-label="Forecast hour"
        getAriaValueText={(value) => `Hour ${value}, ${timeAt(value)}`}
      />
    </Paper>
  );
}
