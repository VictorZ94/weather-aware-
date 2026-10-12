import { useState, type ReactNode } from 'react'
import type { WeightUnit } from '../utils/units'
import { UnitsContext } from './UnitsContext'

const WEIGHT_KEY = 'units.weight'

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

  const setWeightUnit = (unit: WeightUnit) => {
    setWeight(unit)
    store(WEIGHT_KEY, unit)
  }

  return (
    <UnitsContext value={{ weightUnit, setWeightUnit }}>
      {children}
    </UnitsContext>
  )
}
