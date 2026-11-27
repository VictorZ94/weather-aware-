// @packages
import { zodResolver } from "@hookform/resolvers/zod";
import RouteIcon from "@mui/icons-material/AltRoute";
import Button from "@mui/material/Button";
import Stack from "@mui/material/Stack";
import { DateTimePicker } from "@mui/x-date-pickers/DateTimePicker";
import { useEffect } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";

// @components
import { PlaceAutocomplete } from "./PlaceAutocomplete";
import { WeightField } from "./WeightField";

// @scripts
import type { TripPlanRequest } from "../../api/schemas";
import { useUnits } from "../../context/UnitsContext";
import { dayjs, wallClockInZone } from "../../utils/dayjs";
import { fromKg, toKg, type WeightUnit } from "../../utils/units";
import {
  MAX_DAYS_AHEAD,
  tripSchema,
  type TripFormValues,
  type ValidTripFormValues,
} from "./tripSchema";

const SERVER_FIELDS: Record<string, keyof TripFormValues> = {
  origin: "origin",
  destination: "destination",
  departure_time: "departure",
  load_weight_kg: "weight",
};

type Props = {
  onSubmit: (request: TripPlanRequest) => void;
  isLoading: boolean;
  serverFieldErrors?: Record<string, string>;
};

export function TripForm({ onSubmit, isLoading, serverFieldErrors }: Props) {
  const { weightUnit, setWeightUnit } = useUnits();

  const { control, handleSubmit, setError, setValue, getValues } = useForm<
    TripFormValues,
    unknown,
    ValidTripFormValues
  >({
    resolver: zodResolver(tripSchema),
    defaultValues: {
      origin: null,
      destination: null,
      departure: dayjs().add(1, "hour").startOf("hour"),
      weight: "",
    },
  });

  const origin = useWatch({ control, name: "origin" });
  const departure = useWatch({ control, name: "departure" });

  useEffect(() => {
    for (const [field, message] of Object.entries(serverFieldErrors ?? {})) {
      const name = SERVER_FIELDS[field];
      if (name) setError(name, { type: "server", message });
    }
  }, [serverFieldErrors, setError]);

  const changeWeightUnit = (next: WeightUnit) => {
    const typed = Number(getValues("weight"));
    if (getValues("weight").trim() !== "" && Number.isFinite(typed)) {
      setValue(
        "weight",
        String(Math.round(fromKg(toKg(typed, weightUnit), next))),
      );
    }
    setWeightUnit(next);
  };

  const submit = handleSubmit((values) => {
    const { origin, destination, departure } = values;
    if (!departure) return;
    onSubmit({
      origin,
      destination,
      departure_time: wallClockInZone(departure, origin.timezone).format(),
      load_weight_kg:
        Math.round(toKg(Number(values.weight), weightUnit) * 100) / 100,
    });
  });

  let departureHint = "Local time at the origin";
  if (origin) {
    const zone = departure?.isValid()
      ? wallClockInZone(departure, origin.timezone).format("z")
      : origin.timezone;
    departureHint = `Local time in ${origin.label} (${zone})`;
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
            maxDateTime={dayjs().add(MAX_DAYS_AHEAD, "day")}
            slotProps={{
              textField: {
                size: "small",
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
  );
}
