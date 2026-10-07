/** `GET /api/orders/[id]/paperwork-suggestions` — see `paperwork-suggest.ts`. */

export interface PaperworkSuggestion {
  manualId: number;
  name: string;
  type: string | null;
  /** "matches 360148-0010" / "name 31% alike". */
  why: string;
}

export const paperworkSuggestionsKey = (lineId: number) => ['paperwork-suggestions', lineId] as const;

export async function fetchPaperworkSuggestions(lineId: number): Promise<PaperworkSuggestion[]> {
  const res = await fetch(`/api/orders/${lineId}/paperwork-suggestions`, { credentials: 'same-origin' });
  const json = (await res.json().catch(() => ({}))) as { suggestions?: PaperworkSuggestion[]; error?: string };
  if (!res.ok) throw new Error(json.error ?? `Could not read paperwork suggestions (${res.status})`);
  return json.suggestions ?? [];
}
