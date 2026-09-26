/** The running tape a mobile station keeps — the station-neutral model behind the list that stacks upward above a capture window. */

import type { IntakeClass } from '@/design-system/tokens/intake';

/** The three readings a station outcome can have, and the only vocabulary the shared row chrome knows. */
export type StationTone = 'ok' | 'warn' | 'bad';

/** A station's outcome table: its own status union → what the row says. */
export type StationTapeLabel<Status extends string> = Record<
  Status,
  { verb: string; tone: StationTone }
>;

/** One thing on the tape, newest first. */
export interface StationTapeEntry {
  /** Stable React key. Submit-ordered per session, so it never collides. */
  id: string;
  /** How loud this row is. Comes from the station's own label table. */
  tone: StationTone;
  /** What happened, in the station's words ("Scanned out", "Received"). */
  verb: string;
  /** The human name of the thing — a product title. */
  title: string | null;
  /** The machine name — tracking, PO, serial. Rendered by the station. */
  identifier: string | null;
  /** The record this belongs to — an order number, a PO. */
  recordId: string | null;
  /** Condition grade, for `ConditionGradeChip`. Never a "COND" label. */
  conditionGrade: string | null;
  /** Product photo, when the catalog has one. */
  imageUrl: string | null;
  /** Who did this, when it was not the person looking at the screen. */
  actor: string | null;
  /** The staff id behind {@link actor}. */
  actorId: number | null;
  /** The server's own words for a refusal. Never invented client-side. */
  message: string | null;
  /** When this happened, as an ISO instant — NOT when the row was made. */
  at: string;
  /** Station identity for collapse. `null` means "this row stands alone". */
  dedupeKey: string | null;
  /** True when THIS session produced the entry, false when it was seeded from the server. */
  live: boolean;
  /**
   * What the thing IS, on a station that classifies (arrival triage): an
   * `INTAKE` class, printed as its code. Omitted by stations that do not
   * classify. A category, not an outcome — the outcome stays {@link tone}.
   */
  intake?: IntakeClass | null;
}

/** How many rows a tape keeps. */
export const STATION_TAPE_LIMIT = 40;

/** Prepend `entry`, collapsing any earlier row for the same {@link StationTapeEntry.dedupeKey}, and cap at {@link STATION_TAPE_LIMIT}. */
export function pushStationTape(
  tape: readonly StationTapeEntry[],
  entry: StationTapeEntry,
): StationTapeEntry[] {
  const rest =
    entry.dedupeKey == null
      ? tape.filter((row) => row.id !== entry.id)
      : tape.filter((row) => row.id !== entry.id && row.dedupeKey !== entry.dedupeKey);
  return [entry, ...rest].slice(0, STATION_TAPE_LIMIT);
}

/**
 * One verb offered on a tape entry — a reversal, or a triage decision.
 * (2–4 on a triage station, BRIEF §4); the row opens to reveal them.
 */
export interface StationItemAction {
  /** What the button says. Name the act, not the direction ("Undo scan-out"). */
  label: string;
  /** Shown while it runs. */
  pendingLabel: string;
  run: () => void;
  pending: boolean;
  /**
   * The decision the station expects — painted as the ink fill (BRIEF §4
   * triage). At most one per row; the rest are neutral.
   */
  primary?: boolean;
}

/** Build a {@link StationTapeEntry.dedupeKey} for a numeric record id. */
export function stationDedupeKey(kind: string, id: number | null | undefined): string | null {
  if (id == null || !Number.isFinite(id) || id <= 0) return null;
  return `${kind}:${id}`;
}

/** Recover the numeric id from a {@link stationDedupeKey}, or null. */
export function stationDedupeId(kind: string, key: string | null | undefined): number | null {
  if (!key) return null;
  const prefix = `${kind}:`;
  if (!key.startsWith(prefix)) return null;
  const id = Number(key.slice(prefix.length));
  return Number.isFinite(id) && id > 0 ? id : null;
}
