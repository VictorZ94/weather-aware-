// @packages
import { Layer, Source } from "react-map-gl/maplibre";

// @scripts
import type { FeatureCollection, LineString } from "geojson";
import type { Route } from "../../api/schemas";
import { ROUTE_COLORS } from "../../theme";

export const ROUTE_HIT_LAYER_ID = "routes-hit";

type Props = {
  routes: Route[];
  recommendedRouteId: string | null;
  selectedRouteId: string | null;
};

export function RouteLayers({
  routes,
  recommendedRouteId,
  selectedRouteId,
}: Props) {
  const data: FeatureCollection<LineString> = {
    type: "FeatureCollection",
    features: routes.map((route) => ({
      type: "Feature",
      geometry: route.geometry,
      properties: {
        id: route.id,
        recommended: route.id === recommendedRouteId,
        selected: route.id === selectedRouteId,
        order:
          route.id === selectedRouteId
            ? 2
            : route.id === recommendedRouteId
              ? 1
              : 0,
      },
    })),
  };

  return (
    <Source id="routes" type="geojson" data={data}>
      <Layer
        id="routes-outline"
        type="line"
        layout={{
          "line-cap": "round",
          "line-join": "round",
          "line-sort-key": ["get", "order"],
        }}
        paint={{
          "line-color": [
            "case",
            ["get", "selected"],
            ROUTE_COLORS.selectedOutline,
            "#ffffff",
          ],
          "line-width": [
            "case",
            ["get", "selected"],
            11,
            ["get", "recommended"],
            9,
            6,
          ],
        }}
      />
      <Layer
        id="routes-line"
        type="line"
        layout={{
          "line-cap": "round",
          "line-join": "round",
          "line-sort-key": ["get", "order"],
        }}
        paint={{
          "line-color": [
            "case",
            ["get", "recommended"],
            ROUTE_COLORS.recommended,
            ["get", "selected"],
            ROUTE_COLORS.selected,
            ROUTE_COLORS.other,
          ],
          "line-width": ["case", ["get", "recommended"], 6, 4],
        }}
      />
      <Layer
        id={ROUTE_HIT_LAYER_ID}
        type="line"
        layout={{ "line-sort-key": ["get", "order"] }}
        paint={{ "line-width": 22, "line-opacity": 0.01 }}
      />
    </Source>
  );
}
