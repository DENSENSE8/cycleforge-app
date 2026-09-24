/**
 * The running tape a mobile station keeps — the station-neutral model behind the
 * list that stacks upward above a capture window.
 *
 * ## Why this is not scan-out's model
 *
 * It was. `mobile-scan-out-tape.ts` carried `orderId` / `sku` / `qty` /
 * `condition` / `shipmentId` in the entry itself, which is scan-out's schema
 * welded into the shape every other station would have to inherit. Unbox needs
 * PO + line + serial; pack needs box + weight; receive needs a carton. Cloning
 * the file to get a tape means cloning a foreign schema and then not deleting
 * the parts that do not apply — which is how four stations end up with four
 * subtly different lists.
 *
 * So the entry carries what every station's tape actually shows — a name, a
 * photo, the record it belongs to, an identifier, a grade, an outcome, and
 * when. Each is a typed FIELD rendered by a house chip, never a
 * `{ label, value }` pair: a prose label in the data is a hard-coded word that
 * the component cannot translate, restyle, or drop. A station supplies its own
 * outcome vocabulary (see {@link StationTapeLabel}); nothing here knows what
 * "scanned out" means.
 *
 * ## One row per thing
 *
 * `dedupeKey` is the station's answer to "is this the same object I already
 * have?" — a shipment id for scan-out, a carton for unbox. A station that
 * cannot answer passes `null`, and every entry then stands alone. This is the
 * behaviour a fast gun needs: a bounced read must refresh the row it already
 * made rather than stack a second copy the operator will count twice.
 *
 * Pure module: no React, no storage. Unit-tested in `station-tape.test.ts`.
 */

import type { IntakeClass } from '@/design-system/tokens/intake';

/**
 * The three readings a station outcome can have, and the only vocabulary the
 * shared row chrome knows.
 *
 * Deliberately not a status list: a station's statuses are its own business
 * (`ok` / `dup` / `miss` / `exc` / `err` on scan-out; `held` / `short` /
 * `over` on receiving). What the row needs is how loud to be about it.
 *
 * - `ok`   — the job. Quiet confirmation.
 * - `warn` — stop and look. Not a failure, but not the happy path either.
 * - `bad`  — this did not happen, or must not.
 */
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
  /**
   * The human name of the thing — a product title.
   *
   * `null` when there isn't one, and that is a real state, not a gap to paper
   * over: the view then leads with {@link identifier} instead. Never stuff an
   * identifier in here — a 22-digit carrier number is not a name, and a row
   * that treats it as one cannot style the two differently.
   */
  title: string | null;
  /** The machine name — tracking, PO, serial. Rendered by the station. */
  identifier: string | null;
  /**
   * The record this belongs to — an order number, a PO.
   *
   * A FIELD, not a rendered label. It used to arrive inside `meta` as
   * `{ label: 'Order', value }`, which hard-coded a word into the data and then
   * printed it beside a number that already announces itself: the house
   * `OrderIdChip` carries its own `#` glyph and channel tint. Data carries
   * values; components carry vocabulary.
   */
  recordId: string | null;
  /** Condition grade, for `ConditionGradeChip`. Never a "COND" label. */
  conditionGrade: string | null;
  /** Product photo, when the catalog has one. */
  imageUrl: string | null;
  /**
   * Who did this, when it was not the person looking at the screen.
   *
   * `null` for the operator's own live scans — a tape that stamped their own
   * name on every row would be noise. It exists for seeded history, where "who
   * scanned this out" is exactly the question a dock asks when a package cannot
   * be found, and the answer was recorded from day one and never shown.
   */
  actor: string | null;
  /**
   * The staff id behind {@link actor}.
   *
   * Carried separately because the MARK is the identity channel, not the name:
   * `StaffAvatar` resolves `staff.color_hex` from the id, exactly as the slot
   * table's stage cell does. A name alone cannot paint the colour.
   */
  actorId: number | null;
  /** The server's own words for a refusal. Never invented client-side. */
  message: string | null;
  /**
   * When this happened, as an ISO instant — NOT when the row was made.
   *
   * The difference is the whole point of the stamp: a re-read of something that
   * was already done carries the ORIGINAL time, so the row says "1h" and the
   * operator learns this one left an hour ago rather than a second ago.
   */
  at: string;
  /** Station identity for collapse. `null` means "this row stands alone". */
  dedupeKey: string | null;
  /**
   * True when THIS session produced the entry, false when it was seeded from
   * the server.
   *
   * Reversibility hangs off this. A seeded row is somebody's finished work —
   * possibly another operator's, possibly a previous shift's — and offering a
   * one-tap undo on it turns a history list into a destructive control. The
   * operator can only take back what they just did here.
   */
  live: boolean;
  /**
   * What the thing IS, on a station that classifies (arrival triage): an
   * `INTAKE` class, printed as its code. Omitted by stations that do not
   * classify. A category, not an outcome — the outcome stays {@link tone}.
   */
  intake?: IntakeClass | null;
}

/**
 * How many rows a tape keeps.
 *
 * A shift scans hundreds and an operator looks a handful back, so the cap is a
 * memory bound, not a product decision. It is therefore NOT a source of counts:
 * anything reporting a shift total must count commits as they settle, not
 * `tape.length` — a capped array stops being true at row 41 and lies quietly
 * from then on.
 */
export const STATION_TAPE_LIMIT = 40;

/**
 * Prepend `entry`, collapsing any earlier row for the same {@link
 * StationTapeEntry.dedupeKey}, and cap at {@link STATION_TAPE_LIMIT}.
 *
 * Entries with a `null` key never collapse into each other — two unreadable
 * labels are two separate problems, and merging them would hide one.
 */
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
 *
 * Lives on the tape, not in a foot slot, because the mistake a station has to
 * recover from is noticed LATE — two or three captures after the one that was
 * wrong. A single "undo the last thing" handle is already gone by then, and a
 * foot button that appears and disappears also shifts the layout under a thumb
 * that is aiming at something else. A station offers its verbs as a list
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

/**
 * Build a {@link StationTapeEntry.dedupeKey} for a numeric record id.
 *
 * The format was written in one file and taken apart in another with
 * `Number(key.replace('shipment:', ''))`, which is two owners for one string and
 * a silent `NaN` the day the prefix changes. One helper each way, and the
 * reader validates instead of trusting.
 */
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
