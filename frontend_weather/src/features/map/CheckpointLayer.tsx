// @packages
import type { FeatureCollection, Point } from "geojson";
import type { ExpressionSpecification } from "maplibre-gl";
import { Layer, Source } from "react-map-gl/maplibre";

// @scripts
import type { Route } from "../../api/schemas";
import { RISK_COLORS, UNKNOWN_RISK_COLOR } from "../../theme";

export const CHECKPOINT_LAYER_ID = "checkpoints";

export function CheckpointLayer({ route }: { route: Route }) {
  const data: FeatureCollection<Point> = {
    type: "FeatureCollection",
    features: route.checkpoints.map((checkpoint) => ({
      type: "Feature",
      geometry: {
        type: "Point",
        coordinates: [checkpoint.lon, checkpoint.lat],
      },
      properties: {
        id: checkpoint.id,
        risk: checkpoint.risk_level ?? "unknown",
      },
    })),
  };

  const known: ExpressionSpecification = ["!=", ["get", "risk"], "unknown"];
  const color: ExpressionSpecification = [
    "match",
    ["get", "risk"],
    "low",
    RISK_COLORS.low,
    "moderate",
    RISK_COLORS.moderate,
    "high",
    RISK_COLORS.high,
    "severe",
    RISK_COLORS.severe,
    "no_travel",
    RISK_COLORS.no_travel,
    "#ffffff",
  ];

  return (
    <Source id="checkpoints" type="geojson" data={data}>
      <Layer
        id={CHECKPOINT_LAYER_ID}
        type="circle"
        paint={{
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 4, 4.5, 8, 8],
          "circle-color": color,
          "circle-stroke-color": ["case", known, "#ffffff", UNKNOWN_RISK_COLOR],
          "circle-stroke-width": ["case", known, 1.5, 2],
        }}
      />
    </Source>
  );
}
