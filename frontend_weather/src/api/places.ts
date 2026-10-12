import { apiFetch } from "./client";
import { suggestResponseSchema, type Place } from "./schemas";

export async function suggestPlaces(
  text: string,
  signal?: AbortSignal,
): Promise<Place[]> {
  const query = new URLSearchParams({ q: text });
  const data = await apiFetch(
    `/places/suggest/?${query}`,
    suggestResponseSchema,
    { signal },
  );
  return data.suggestions;
}
