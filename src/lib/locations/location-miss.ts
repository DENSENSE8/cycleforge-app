/**
 * A typed location code that matched none, and the real locations offered in
 * its place (the `suggestions` a location `GET` / verify 404 carries).
 *
 * Read with {@link locationMissSuggestions}, a structural check — never
 * `instanceof`: a hot-reloaded or duplicated module instance hands back a
 * different class identity (Safari: "Right hand side of instanceof is not an
 * object"), while the shape always survives.
 */

export type LocationSuggestion = { code: string; face: string };

/** The code matched no location; `suggestions` are the nearest real ones to offer as taps. */
export class LocationNotFoundError extends Error {
  readonly suggestions: LocationSuggestion[];

  constructor(message: string, suggestions: LocationSuggestion[]) {
    super(message);
    this.name = 'LocationNotFoundError';
    this.suggestions = suggestions;
  }
}

/** The suggestions a failed location read carries; empty for any other error. */
export function locationMissSuggestions(error: unknown): LocationSuggestion[] {
  if (!error || typeof error !== 'object' || !('suggestions' in error) || !Array.isArray(error.suggestions)) return [];
  return error.suggestions.filter((item): item is LocationSuggestion =>
    item != null && typeof item === 'object' && typeof item.code === 'string' && typeof item.face === 'string');
}
