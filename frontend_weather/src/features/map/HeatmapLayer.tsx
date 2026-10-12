// @packages
import type { FeatureCollection, Point } from "geojson";
import { useMemo } from "react";
import { Layer, Source } from "react-map-gl/maplibre";

// @scripts
import type { Heatmap } from "../../api/schemas";
import { RISK_COLORS } from "../../theme";

const MAX_LEVEL = 4;

type Props = {
  heatmap: Heatmap;
  hour: number;
};

export function HeatmapLayer({ heatmap, hour }: Props) {
  const data = useMemo<FeatureCollection<Point>>(
    () => ({
      type: "FeatureCollection",
      features: heatmap.points.flatMap(([lon, lat], point) =>
        heatmap.levels[point].flatMap((level, h) =>
          level > 0
            ? [
                {
                  type: "Feature" as const,
                  geometry: { type: "Point" as const, coordinates: [lon, lat] },
                  properties: { hour: h, weight: level / MAX_LEVEL },
                },
              ]
            : [],
        ),
      ),
    }),
    [heatmap],
  );

  return (
    <Source id="risk-heatmap" type="geojson" data={data}>
      <Layer
        id="risk-heatmap"
        type="heatmap"
        filter={["==", ["get", "hour"], hour]}
        paint={{
          "heatmap-weight": ["get", "weight"],
          "heatmap-intensity": 0.12,
          "heatmap-radius": [
            "interpolate",
            ["exponential", 2],
            ["zoom"],
            3,
            8,
            9,
            512,
          ],
          "heatmap-opacity": 0.6,
          "heatmap-color": [
            "interpolate",
            ["linear"],
            ["heatmap-density"],
            0,
            "rgba(251, 192, 45, 0)",
            0.2,
            RISK_COLORS.moderate,
            0.45,
            RISK_COLORS.high,
            0.7,
            RISK_COLORS.severe,
            1,
            RISK_COLORS.no_travel,
          ],
        }}
      />
    </Source>
  );
}
