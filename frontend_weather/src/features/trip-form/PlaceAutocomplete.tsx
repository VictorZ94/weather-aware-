import Autocomplete from '@mui/material/Autocomplete'
import CircularProgress from '@mui/material/CircularProgress'
import TextField from '@mui/material/TextField'
import { useState, type Ref } from 'react'
import type { Place } from '../../api/schemas'
import { MIN_SUGGEST_CHARS, usePlaceSuggestions } from '../../hooks/usePlaceSuggestions'

type Props = {
  label: string
  value: Place | null
  onChange: (place: Place | null) => void
  onBlur: () => void
  error?: string
  inputRef?: Ref<HTMLInputElement>
}

export function PlaceAutocomplete({ label, value, onChange, onBlur, error, inputRef }: Props) {
  const [inputValue, setInputValue] = useState('')

  // Once a place is picked the input holds its label; that is not a search.
  const searchText = value && inputValue === value.label ? '' : inputValue
  const { options, isSearching, isError } = usePlaceSuggestions(searchText)

  // The picked place must stay among the options for MUI to match it;
  // `filterSelectedOptions` keeps it out of the visible list.
  const allOptions =
    value && !options.some((option) => option.id === value.id) ? [value, ...options] : options

  let noOptionsText = 'No places found'
  if (searchText.trim().length < MIN_SUGGEST_CHARS) {
    noOptionsText = `Type at least ${MIN_SUGGEST_CHARS} characters`
  } else if (isError) {
    noOptionsText = 'Could not load suggestions'
  }

  return (
    <Autocomplete
      value={value}
      onChange={(_, place) => onChange(place)}
      inputValue={inputValue}
      onInputChange={(_, text) => setInputValue(text)}
      onBlur={onBlur}
      options={allOptions}
      // Django does the matching; show what it returns as is.
      filterOptions={(shown) => shown}
      filterSelectedOptions
      getOptionLabel={(place) => place.label}
      isOptionEqualToValue={(option, selected) => option.id === selected.id}
      loading={isSearching}
      loadingText="Searching…"
      noOptionsText={noOptionsText}
      autoHighlight
      fullWidth
      size="small"
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          error={Boolean(error)}
          helperText={error}
          inputRef={inputRef}
          slotProps={{
            ...params.slotProps,
            input: {
              ...params.slotProps.input,
              endAdornment: (
                <>
                  {isSearching ? <CircularProgress color="inherit" size={18} /> : null}
                  {params.slotProps.input.endAdornment}
                </>
              ),
            },
          }}
        />
      )}
    />
  )
}
