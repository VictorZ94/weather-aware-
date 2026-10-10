import { setWorkerUrl } from 'maplibre-gl'
// MapLibre looks for its worker next to its own file, which no longer holds
// once Vite bundles it. `?worker&url` has Vite build the worker and return
// its real URL.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

setWorkerUrl(workerUrl)
