/**
 * Station next action — the one big line on a Scan Station that says what to
 * physically do with the thing in hand (handoff 2026-10-06). One shared
 * shape; each station owns a pure resolver that fills it from what is
 * already on screen. No subtitle (operator 2026-10-07).
 */

export type StationNextActionTone = 'default' | 'warning' | 'danger';

export interface StationNextAction<Kind extends string = string> {
  /** What the next step is about (`return`, `location`, …). */
  kind: Kind;
  /** The physical next step, e.g. "Place on the Return rack". */
  headline: string;
  /** Where it goes: by name, plus the linked rack / shelf code when the org has linked one. */
  destination?: { label: string; code?: string | null };
  tone: StationNextActionTone;
}
