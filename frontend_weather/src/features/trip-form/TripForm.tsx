import { zodResolver } from '@hookform/resolvers/zod'
import RouteIcon from '@mui/icons-material/AltRoute'
import Button from '@mui/material/Button'
import FormControl from '@mui/material/FormControl'
import FormHelperText from '@mui/material/FormHelperText'
import FormLabel from '@mui/material/FormLabel'
import Stack from '@mui/material/Stack'
import ToggleButton from '@mui/material/ToggleButton'
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup'
import { DateTimePicker } from '@mui/x-date-pickers/DateTimePicker'
import { useEffect } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { CHECKPOINT_INTERVALS, type TripPlanRequest } from '../../api/schemas'
import { useUnits } from '../../context/UnitsContext'
import { dayjs, wallClockInZone } from '../../utils/dayjs'
import { fromKg, toKg, type WeightUnit } from '../../utils/units'
import { PlaceAutocomplete } from './PlaceAutocomplete'
import { tripSchema, type TripFormValues, type ValidTripFormValues } from './tripSchema'
import { WeightField } from './WeightField'

// Django's field names -> form field names.
const SERVER_FIELDS: Record<string, keyof TripFormValues> = {
  origin: 'origin',
  destination: 'destination',
  departure_time: 'departure',
  load_weight_kg: 'weight',
  checkpoint_interval_miles: 'interval',
}

type Props = {
  onSubmit: (request: TripPlanRequest) => void
  isLoading: boolean
  serverFieldErrors?: Record<string, string>
}

export function TripForm({ onSubmit, isLoading, serverFieldErrors }: Props) {
  const { weightUnit, setWeightUnit } = useUnits()

  const { control, handleSubmit, setError, setValue, getValues } = useForm<
    TripFormValues,
    unknown,
    ValidTripFormValues
  >({
    resolver: zodResolver(tripSchema),
    defaultValues: {
      origin: null,
      destination: null,
      departure: dayjs().add(1, 'hour').startOf('hour'),
      weight: '',
      interval: 25,
    },
  })

  const origin = useWatch({ control, name: 'origin' })
  const departure = useWatch({ control, name: 'departure' })

  useEffect(() => {
    for (const [field, message] of Object.entries(serverFieldErrors ?? {})) {
      const name = SERVER_FIELDS[field]
      if (name) setError(name, { type: 'server', message })
    }
  }, [serverFieldErrors, setError])

  const changeWeightUnit = (next: WeightUnit) => {
    const typed = Number(getValues('weight'))
    if (getValues('weight').trim() !== '' && Number.isFinite(typed)) {
      setValue('weight', String(Math.round(fromKg(toKg(typed, weightUnit), next))))
    }
    setWeightUnit(next)
  }

  const submit = handleSubmit((values) => {
    const { origin, destination, departure } = values
    if (!departure) return
    onSubmit({
      origin,
      destination,
      departure_time: wallClockInZone(departure, origin.timezone).format(),
      // Two decimals, not whole kg: Django's load rules work in pounds, and
      // 40,000 lb must not come back as 40,001 after the round trip.
      load_weight_kg: Math.round(toKg(Number(values.weight), weightUnit) * 100) / 100,
      checkpoint_interval_miles: values.interval,
    })
  })

  let departureHint = 'Local time at the origin'
  if (origin) {
    const zone = departure?.isValid()
      ? wallClockInZone(departure, origin.timezone).format('z')
      : origin.timezone
    departureHint = `Local time in ${origin.label} (${zone})`
  }

  return (
    <Stack component="form" onSubmit={submit} noValidate spacing={2}>
      <Controller
        name="origin"
        control={control}
        render={({ field, fieldState }) => (
          <PlaceAutocomplete
            label="Origin"
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            inputRef={field.ref}
            error={fieldState.error?.message}
          />
        )}
      />

      <Controller
        name="destination"
        control={control}
        render={({ field, fieldState }) => (
          <PlaceAutocomplete
            label="Destination"
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            inputRef={field.ref}
            error={fieldState.error?.message}
          />
        )}
      />

      <Controller
        name="departure"
        control={control}
        render={({ field, fieldState }) => (
          <DateTimePicker
            label="Departure"
            value={field.value}
            onChange={field.onChange}
            inputRef={field.ref}
            disablePast
            slotProps={{
              textField: {
                size: 'small',
                fullWidth: true,
                onBlur: field.onBlur,
                error: Boolean(fieldState.error),
                helperText: fieldState.error?.message ?? departureHint,
              },
            }}
          />
        )}
      />

      <Controller
        name="weight"
        control={control}
        render={({ field, fieldState }) => (
          <WeightField
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            inputRef={field.ref}
            unit={weightUnit}
            onUnitChange={changeWeightUnit}
            error={fieldState.error?.message}
          />
        )}
      />

      <Controller
        name="interval"
        control={control}
        render={({ field, fieldState }) => (
          <FormControl error={Boolean(fieldState.error)}>
            <FormLabel id="interval-label" sx={{ fontSize: '0.8rem', mb: 0.5 }}>
              Check weather every
            </FormLabel>
            <ToggleButtonGroup
              exclusive
              fullWidth
              size="small"
              color="primary"
              aria-labelledby="interval-label"
              value={field.value}
              // MUI sends null when the active button is clicked again.
              onChange={(_, miles) => miles !== null && field.onChange(miles)}
            >
              {CHECKPOINT_INTERVALS.map((miles) => (
                <ToggleButton key={miles} value={miles}>
                  {miles} mi
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            {fieldState.error && <FormHelperText>{fieldState.error.message}</FormHelperText>}
          </FormControl>
        )}
      />

      <Button
        type="submit"
        variant="contained"
        size="large"
        loading={isLoading}
        loadingPosition="start"
        startIcon={<RouteIcon />}
      >
        Plan trip
      </Button>
    </Stack>
  )
}
