// @packages
import { keepPreviousData, useQuery } from "@tanstack/react-query";

// @scripts
import { suggestPlaces } from "../api/places";
import { useDebouncedValue } from "./useDebouncedValue";

export const MIN_SUGGEST_CHARS = 2;
const DEBOUNCE_MS = 300;

export function usePlaceSuggestions(text: string) {
  const trimmed = text.trim();
  const debounced = useDebouncedValue(trimmed, DEBOUNCE_MS);
  const longEnough = trimmed.length >= MIN_SUGGEST_CHARS;

  const query = useQuery({
    queryKey: ["places", "suggest", debounced],
    queryFn: ({ signal }) => suggestPlaces(debounced, signal),
    enabled: longEnough && debounced.length >= MIN_SUGGEST_CHARS,
    placeholderData: keepPreviousData,
  });

  return {
    options: longEnough ? (query.data ?? []) : [],
    isSearching: longEnough && (query.isFetching || debounced !== trimmed),
    isError: query.isError,
  };
}
