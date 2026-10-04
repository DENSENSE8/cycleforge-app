/** Resolved cell facts a field-catalog resolver hands its painter — strings and flags only. */

/** How late a row is, and WHEN the deadline is. */
export interface Delay {
  days: number;
  overdue: boolean;
  /** Compact civil face ("Aug 17"). Null/absent = no deadline to show. */
  dateLabel?: string | null;
  /** `YYYY-MM-DD` for DateRangePickerField when the delay is editable. */
  dateKey?: string | null;
  /** True when `dateKey` is warehouse-today — due today, not merely on time. */
  dueToday?: boolean;
  /** Whole days from warehouse-today UNTIL the deadline, for a deadline that has not passed. */
  daysUntil?: number | null;
  /** Non-deadline secondary temporal face for the Calendar line (dwell, enrolled, …). */
  faceLabel?: string | null;
}

/** Where a row goes next — the STATUS line's second fact. */
export interface NextStep {
  /** The station or step this row is headed for ("Pack", "Scan out"). */
  label: string;
  /** Terminal — nothing comes next. Paints the finished face. */
  done?: boolean;
  /** Needs a human before it can move (a hold). Paints the alert tone. */
  blocked?: boolean;
  /** Hover detail — the full phrase when the track clips it. */
  tip?: string;
}

/** Lifecycle tone — deliberately small, and deliberately not a colour. */
export type StateTone =
  /** Ordinary progress. Neutral by default — most WMS states are unremarkable. */
  | 'neutral'
  /** Finished / confirmed. */
  | 'done'
  /** Needs a human: hold, exception, mismatch. The only attention-grabbing tone. */
  | 'alert';

/** One toned fragment of an item's bound subtitle line. */
export interface SubtitlePart {
  text: string;
  /** Text tone class from the family's SoT; absent = the quiet line default. */
  toneClass?: string;
  /** Stable part key (the family's field id). Presentational string only. */
  key?: string;
  /** Reserve a fixed character width for this part. */
  widthCh?: number;
}

/**
 * Facts for one lifecycle step (`tested`, `packed`, `scannedOut`).
 * Strings only — the painter joins the non-blank parts; a missing part is
 * omitted, never rendered as an empty `·` gap.
 */
export interface StageStepFacts {
  who: string | null;
  /** The actor's staff id — resolves the AVATAR (photo → initials on the staffer's colour) through the identity cache. */
  whoStaffId?: number | null;
  /** Long civil stamp — hover / {@link formatStageStepLine}. */
  at: string | null;
  /** Raw instant for a painted short face. Absent ⇒ the painter falls back to {@link at}. */
  atInstant?: string | null;
  station: string | null;
}

/** One resolved slot cell, discriminated by paint kind. */
export type SlotValue =
  | ({ kind: 'stage_event' } & StageStepFacts)
  | { kind: 'value'; text: string | null }
  /**
   * Person face — staff id drives {@link StaffAvatar}; name is the visible
   * label. Never paint a bare staff id or `Staff #N` as the face.
   */
  | { kind: 'person'; staffId: number | null; name: string | null };

/**
 * Secondary line for a stage step: `who · time · station`, blanks dropped.
 * Returns `null` when nothing landed — the painter drops the tooltip and
 * leaves its second line blank.
 */
export function formatStageStepLine(step: StageStepFacts | null | undefined): string | null {
  if (!step) return null;
  const bits = [step.who, step.at, step.station]
    .map((s) => String(s ?? '').trim())
    .filter(Boolean);
  return bits.length > 0 ? bits.join(' · ') : null;
}
