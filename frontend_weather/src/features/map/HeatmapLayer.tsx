import type { FeatureCollection, Point } from 'geojson'
import { useMemo } from 'react'
import { Layer, Source } from 'react-map-gl/maplibre'
import type { Heatmap } from '../../api/schemas'
import { RISK_COLORS } from '../../theme'

type Props = {
  heatmap: Heatmap
  hour: number
}

export function HeatmapLayer({ heatmap, hour }: Props) {
  // Every hour goes into the source once. Moving the slider only changes the
  // layer filter below, so switching hours uploads nothing.
  const data = useMemo<FeatureCollection<Point>>(
    () => ({
      type: 'FeatureCollection',
      features: heatmap.hours.flatMap((frame) =>
        frame.points.map(([lon, lat, intensity]) => ({
          type: 'Feature',
          geometry: { type: 'Point', coordinates: [lon, lat] },
          properties: { hour: frame.hour, intensity },
        })),
      ),
    }),
    [heatmap],
  )

  return (
    <Source id="risk-heatmap" type="geojson" data={data}>
      <Layer
        id="risk-heatmap"
        type="heatmap"
        filter={['==', ['get', 'hour'], hour]}
        paint={{
          'heatmap-weight': ['get', 'intensity'],
          'heatmap-intensity': 0.35,
          // Doubles with each zoom level so the blobs keep their size on the ground.
          'heatmap-radius': ['interpolate', ['exponential', 2], ['zoom'], 3, 12, 9, 768],
          'heatmap-opacity': 0.55,
          'heatmap-color': [
            'interpolate',
            ['linear'],
            ['heatmap-density'],
            0,
            'rgba(0, 0, 0, 0)',
            0.15,
            RISK_COLORS.low,
            0.35,
            RISK_COLORS.moderate,
            0.55,
            RISK_COLORS.high,
            0.75,
            RISK_COLORS.severe,
            1,
            RISK_COLORS.no_travel,
          ],
        }}
      />
    </Source>
  )
}
