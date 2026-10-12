// @scripts
import { apiRequest } from "./client";
import { suggestResponseSchema, type Place } from "./schemas";

export async function suggestPlaces(
  text: string,
  signal?: AbortSignal,
): Promise<Place[]> {
  const data = await apiRequest("/places/suggest/", suggestResponseSchema, {
    params: { q: text },
    signal,
  });
  return data.suggestions;
}
