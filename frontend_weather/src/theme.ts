import { createTheme } from '@mui/material/styles'
import type { RiskLevel } from './api/schemas'

// Single source for risk colours: map, cards, miles bar and legend.
export const RISK_COLORS: Record<RiskLevel, string> = {
  low: '#2e7d32',
  moderate: '#fbc02d',
  high: '#ef6c00',
  severe: '#d32f2f',
  no_travel: '#4a148c',
}

export const RISK_LABELS: Record<RiskLevel, string> = {
  low: 'Low',
  moderate: 'Moderate',
  high: 'High',
  severe: 'Severe',
  no_travel: 'No Travel',
}

// Checkpoints and miles with no forecast.
export const UNKNOWN_RISK_COLOR = '#9e9e9e'

export const ROUTE_COLORS = {
  recommended: '#1565c0',
  selected: '#546e7a',
  other: '#9aa5b1',
  selectedOutline: '#102a43',
}

export const theme = createTheme({
  palette: {
    primary: { main: ROUTE_COLORS.recommended },
    background: { default: '#f4f6f8' },
  },
  shape: { borderRadius: 8 },
  typography: {
    h1: { fontSize: '1.25rem', fontWeight: 700 },
    h2: { fontSize: '1rem', fontWeight: 700 },
  },
})
