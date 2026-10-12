import { createContext, useContext } from 'react'
import type { WeightUnit } from '../utils/units'

export type Units = {
  weightUnit: WeightUnit
  setWeightUnit: (unit: WeightUnit) => void
}

export const UnitsContext = createContext<Units | null>(null)

export function useUnits(): Units {
  const units = useContext(UnitsContext)
  if (!units) throw new Error('useUnits must be used inside UnitsProvider')
  return units
}
