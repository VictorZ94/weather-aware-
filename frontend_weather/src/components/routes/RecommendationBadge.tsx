// @packages
import StarIcon from "@mui/icons-material/Star";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";

export function RecommendationBadge({ reason }: { reason: string | null }) {
  return (
    <Box>
      <Tooltip title={reason ?? ""} arrow>
        <Chip
          icon={<StarIcon />}
          label="Recommended"
          color="primary"
          size="small"
        />
      </Tooltip>
      {reason && (
        <Typography variant="body2" sx={{ mt: 0.5 }}>
          {reason}
        </Typography>
      )}
    </Box>
  );
}
