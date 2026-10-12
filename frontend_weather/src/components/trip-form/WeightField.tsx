// @packages
import InputAdornment from "@mui/material/InputAdornment";
import MenuItem from "@mui/material/MenuItem";
import Select from "@mui/material/Select";
import TextField from "@mui/material/TextField";
import type { Ref } from "react";

// @scripts
import type { WeightUnit } from "../../utils/units";

type Props = {
  value: string;
  onChange: (value: string) => void;
  onBlur: () => void;
  unit: WeightUnit;
  onUnitChange: (unit: WeightUnit) => void;
  error?: string;
  inputRef?: Ref<HTMLInputElement>;
};

export function WeightField({
  value,
  onChange,
  onBlur,
  unit,
  onUnitChange,
  error,
  inputRef,
}: Props) {
  return (
    <TextField
      label="Cargo weight"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onBlur={onBlur}
      error={Boolean(error)}
      helperText={error}
      inputRef={inputRef}
      fullWidth
      size="small"
      slotProps={{
        htmlInput: { inputMode: "decimal" },
        input: {
          endAdornment: (
            <InputAdornment position="end">
              <Select
                value={unit}
                onChange={(event) => onUnitChange(event.target.value)}
                variant="standard"
                disableUnderline
                slotProps={{ input: { "aria-label": "Weight unit" } }}
              >
                <MenuItem value="lb">lb</MenuItem>
                <MenuItem value="kg">kg</MenuItem>
              </Select>
            </InputAdornment>
          ),
        },
      }}
    />
  );
}
