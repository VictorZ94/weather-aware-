import { useState, type ReactNode } from 'react'
import type { TemperatureUnit, WeightUnit } from '../utils/units'
import { UnitsContext } from './UnitsContext'

const WEIGHT_KEY = 'units.weight'
const TEMPERATURE_KEY = 'units.temperature'

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const stored = localStorage.getItem(key)
    return allowed.includes(stored as T) ? (stored as T) : fallback
  } catch {
    return fallback
  }
}

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Storage blocked (private window): the choice just lasts for this visit.
  }
}

export function UnitsProvider({ children }: { children: ReactNode }) {
  const [weightUnit, setWeight] = useState<WeightUnit>(() =>
    readStored(WEIGHT_KEY, ['lb', 'kg'], 'lb'),
  )
  const [temperatureUnit, setTemperature] = useState<TemperatureUnit>(() =>
    readStored(TEMPERATURE_KEY, ['F', 'C'], 'F'),
  )

  const setWeightUnit = (unit: WeightUnit) => {
    setWeight(unit)
    store(WEIGHT_KEY, unit)
  }
  const setTemperatureUnit = (unit: TemperatureUnit) => {
    setTemperature(unit)
    store(TEMPERATURE_KEY, unit)
  }

  return (
    <UnitsContext value={{ weightUnit, temperatureUnit, setWeightUnit, setTemperatureUnit }}>
      {children}
    </UnitsContext>
  )
}
