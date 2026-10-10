import { createContext, useContext } from 'react'
import type { TemperatureUnit, WeightUnit } from '../utils/units'

export type Units = {
  weightUnit: WeightUnit
  temperatureUnit: TemperatureUnit
  setWeightUnit: (unit: WeightUnit) => void
  setTemperatureUnit: (unit: TemperatureUnit) => void
}

export const UnitsContext = createContext<Units | null>(null)

export function useUnits(): Units {
  const units = useContext(UnitsContext)
  if (!units) throw new Error('useUnits must be used inside UnitsProvider')
  return units
}
