/**
 * The COMPOUND row view-model — one shape every table adapts into.
 *
 * This is the anti-fork seam. A two-row WMS cell needs the same six facts on
 * every surface (a picture, a name, its codes, a fulfillment id, a state, a
 * stamp), but each family stores them under different column names on a
 * different row type. The tempting move is a compound cell set per family;
 * that is four copies of the same layout drifting apart the first time one gets
 * a fix.
 *
 * Instead: **one renderer, many adapters.** A family writes a pure
 * `row -> CompoundRowView` function — no JSX, no hooks, trivially testable —
 * and inherits the layout, the alignment rules and every future fix for free.
 * Adding a table is a mapper, not a cell set.
 *
 * Deliberately flat and presentational: strings and enums only, no React nodes.
 * A view-model that could carry JSX would let a family smuggle bespoke markup
 * back in, which is the fork wearing a different hat. Where a family genuinely
 * needs a house chip (order id, tracking), it names the VALUE and the renderer
 * picks the chip.
 */

/**
 * How late a row is, and WHEN the deadline is.
 *
 * `days` / `overdue` are relative urgency. `dateLabel` is the civil day the
 * operator actually needs ("Aug 17") — "On time" / "1d late" hide that fact.
 * Families without a warehouse deadline omit `dateLabel` and the cell falls
 * back to the relative face.
 */
export interface CompoundDelay {
  days: number;
  overdue: boolean;
  /** Compact civil face ("Aug 17"). Null/absent = no deadline to show. */
  dateLabel?: string | null;
  /** `YYYY-MM-DD` for DateRangePickerField when the delay is editable. */
  dateKey?: string | null;
  /** True when `dateKey` is warehouse-today — due today, not merely on time. */
  dueToday?: boolean;
}

/** Lifecycle tone — deliberately small, and deliberately not a colour. */
export type CompoundStateTone =
  /** Ordinary progress. Neutral by default — most WMS states are unremarkable. */
  | 'neutral'
  /** Finished / confirmed. */
  | 'done'
  /** Needs a human: hold, exception, mismatch. The only attention-grabbing tone. */
  | 'alert';

export interface CompoundRowView {
  /** Stable row id — used for keys and the open intent. */
  id: string;
  /** Square photo. `null` renders the typed placeholder, never a broken image. */
  thumbUrl: string | null;

  /** TITLE column, top — what the thing is. */
  title: string;
  /**
   * TITLE column hyperlink — the listing this row sells.
   *
   * Present ⇒ the title is an `<a>` to this href (new tab). Absent ⇒ the title
   * stays plain text. A join, not a second field: Orders derives it from the
   * item number (`getExternalUrlByItemNumber`). Other families omit it.
   */
  titleHref?: string | null;
  /**
   * TITLE column, bottom — the operator note on this row.
   *
   * Was the SKU/code list until the column contract was ruled (see the hard
   * rules in `docs/todo/compound-row-column-contract-HANDOFF.md`). Codes are an
   * identifier and identifiers belong in the IDS column; what an operator needs
   * under a title is what somebody wrote about this specific row.
   */
  note: string | null;
  /**
   * Optional triage flag mark beside the title — the wash's non-colour carrier
   * (Orders row flags). Presentational only: label + tip + solid-dot class.
   */
  flagMark?: {
    label: string;
    tip: string;
    dotClass: string;
  } | null;

  /** Column 3 top — the fulfillment handle (order #, PO). */
  orderId: string | null;
  /** Column 3 bottom — carrier tracking. */
  tracking: string | null;
  /** Raw source-platform value — resolved to the ORDER identity brand dot. */
  platformValue: string | null;
  /**
   * Authoritative carrier from the shipment/label, when the family has one.
   * Resolved to the TRACKING identity brand dot; `null` falls back to detecting
   * the brand from the number itself.
   */
  carrier: string | null;

  /** Column 4 top — the state pill. */
  stateLabel: string;
  stateTone: CompoundStateTone;
  /**
   * Hover detail for the state pill.
   *
   * The pill clips to one line inside a 10rem track, so a family whose state
   * vocabulary is longer than the track (Incoming's `Delivered · not scanned`)
   * needs somewhere to put the full phrase. `undefined` renders the bare pill —
   * the label is already the whole fact on Receiving and Orders.
   */
  stateTip?: string;
  /**
   * STATUS column, bottom — the DELAY, not a generic timestamp.
   *
   * When {@link CompoundDelay.dateLabel} is present the cell paints that civil
   * day (lateness is tone + a "Nd late" suffix). Families that only know
   * relative urgency omit the date and keep the on-time / Nd-late face.
   * `null` with no editor is the on-time face, never a blank line.
   */
  delay: CompoundDelay | null;
  /** Hover detail for the delay (the actual deadline instant). */
  delayTip?: string;

  /**
   * AMOUNT column, top — the money this row is worth, already formatted.
   *
   * Pre-formatted by the adapter on purpose. The view model is strings and
   * enums by contract, and currency is a locale/tenant decision that belongs to
   * whatever SoT the family already uses — not to a table cell that would have
   * to grow an opinion about minor units and signs.
   *
   * `null` renders an empty track, which is the honest answer for a checklist
   * item. A row that HAS money and shows nothing would be the bug.
   */
  amount: string | null;
  /**
   * AMOUNT column, bottom — the arithmetic behind it (`×3 @ $49.99`).
   *
   * The second line is the WORKING, not a timestamp: a cart line's total is a
   * number somebody will be asked to justify at the counter, and showing the
   * multiplication under it answers the question before it is asked.
   */
  amountNote?: string | null;
  /**
   * Is this amount a CREDIT (money going the other way)?
   *
   * A trade-in is negative and must not read as a discount on a sale. The minus
   * sign alone is easy to miss down a column of tabular figures, so the tone
   * carries it too. Deliberately not a colour name — the cell owns the paint.
   */
  amountCredit?: boolean;

  /**
   * Materialized SLOT cells, keyed by TRACK key (`status:1`, `status:2`, …).
   *
   * A family that mounts slot tracks (Orders / To-ship) resolves one value per
   * bound slot per row — the track's `fieldId` says WHAT, this record says the
   * resolved facts. Optional so Receiving / Tasks / Incoming never carry it.
   * Replaced the hard-coded `steps.tested` union: the cell now branches on the
   * value's `kind`, never on a field name.
   */
  slots?: Readonly<Record<string, CompoundSlotValue>>;

  /**
   * BOUND subtitle parts for the item cell's second line — the org-configured
   * replacement for {@link note}. Present (even empty) ⇒ the layout binds
   * subtitles and this list IS the line, in binding order, parts joined by
   * ` · `; absent ⇒ the legacy note fallback paints. Each part may carry a
   * tone CLASS resolved by the family adapter from its own SoT (qty count
   * tone, condition grade tone) — same precedent as `flagMark.dotClass`: the
   * view model names the paint, the adapter names the meaning.
   */
  subtitleParts?: readonly CompoundSubtitlePart[];
}

/** One toned fragment of the item cell's bound subtitle line. */
export interface CompoundSubtitlePart {
  text: string;
  /** Text tone class from the family's SoT; absent = the quiet line default. */
  toneClass?: string;
  /**
   * Stable part key (the family's field id) — how a subtitle-select editor
   * (see {@link CompoundSubtitleSelect}) claims its part. Presentational
   * string only; the chrome matches keys, it never interprets them.
   */
  key?: string;
  /**
   * Reserve a fixed character width for this part.
   *
   * For facts whose LENGTH varies but whose column should not: a quantity is
   * one digit on most rows and two on some, and letting it size to content
   * moved every fact after it sideways from row to row, so the line stopped
   * being scannable down the grid. The family names the reservation because
   * only it knows the fact's realistic range.
   */
  widthCh?: number;
}

/** One row of a subtitle-select editor's menu. Strings and flags only. */
export interface CompoundSubtitleSelectOption {
  value: string;
  label: string;
  /** Text tone for the option row, from the family's SoT. */
  toneClass?: string;
  /** Wash class painted when {@link current}; from the family's SoT. */
  currentClass?: string;
  /** One-line meaning (title attr) — teaches the vocabulary in place. */
  description?: string;
  /** This option matches the row's current value. */
  current?: boolean;
}

/**
 * An in-place SELECT editor for one subtitle part — the capability object a
 * family passes when a bound subtitle fact is a scalar with a real PATCH
 * (To-ship condition). Same law as `onCommitNote` before it and `onOpen`
 * still: presence of the handler makes the part editable, absence leaves the
 * identical part read-only — never a second component.
 *
 * Options arrive resolved (labels, tones, current) so the chrome never
 * imports a family SoT; it renders what it is handed and reports the picked
 * `value` (or `null` for the clear row) through {@link onCommit}.
 */
export interface CompoundSubtitleSelect {
  /** The {@link CompoundSubtitlePart.key} this editor claims. */
  partKey: string;
  /** What the fact is called ("Condition") — the trigger's accessible name. */
  label: string;
  options: readonly CompoundSubtitleSelectOption[];
  /** Present ⇒ the menu offers a clear row with this copy. */
  clearLabel?: string;
  onCommit: (value: string | null) => void;
}

/**
 * A subtitle part the operator can retype in place.
 *
 * The sibling of {@link CompoundSubtitleSelect} for facts with no option list —
 * a quantity, an item number, a note. Same law: the capability is declared by
 * the family, the chrome renders it, and a part nobody claims stays read-only
 * text. The row keeps Enter/Space, so the trigger is click-only (`tabIndex -1`)
 * exactly as the select's is.
 *
 * `onCommit` receives the trimmed string, or `null` when the operator clears
 * it. It is called only when the value actually changed — an editor that opens
 * and closes untouched must not write.
 */
export interface CompoundSubtitleEdit {
  /** The {@link CompoundSubtitlePart.key} this editor claims. */
  partKey: string;
  /** What the fact is called ("Item number") — the trigger's accessible name. */
  label: string;
  /** Seeds the field. The part's TEXT may be a formatted face, not the value. */
  value: string;
  /** `numeric` gets an inputMode + a numeric keypad on a tablet. */
  kind?: 'text' | 'numeric';
  placeholder?: string;
  onCommit: (value: string | null) => void;
}

/**
 * In-place editor for the STATUS column's ship-by date.
 *
 * Present ⇒ the delay line mounts DateRangePickerField `variant="compact"`
 * (one civil day, calendar only, click commits). Always paints a face (`MMM d`
 * or `--`); never clears. Absent ⇒ the same line is read-only.
 */
export interface CompoundShipByEdit {
  /** Civil key currently on the row (`YYYY-MM-DD`); empty when missing. */
  value: string;
  onCommit: (dateKey: string | null) => void;
}

/**
 * A subtitle part that paints as a copy chip instead of bare text.
 *
 * The face is always the listing glyph — never {@link value}. Live
 * {@link openHref} ⇒ info-blue, click opens. Missing URL or missing handle ⇒
 * faint (grayed-out) icon. Hover copies {@link value} only when a handle exists.
 */
export interface CompoundSubtitleCopy {
  /** The {@link CompoundSubtitlePart.key} this chip claims. */
  partKey: string;
  /**
   * The full value to place on the clipboard. Never painted — the face is
   * the listing icon.
   */
  value: string;
  /** Unused. Kept so older call sites that passed a last-8 face still type-check. */
  display?: string;
  /**
   * Listing URL. Present ⇒ click opens this href (info-blue icon). Absent ⇒
   * grayed-out icon (missing item number or unjoinable listing). Hover copies
   * {@link value} only when a handle exists.
   */
  openHref?: string | null;
}

/**
 * One resolved slot cell, discriminated by paint kind.
 *
 * `stage_event` is the two-row lifecycle step (icon + label over
 * who · time · station); `value` is the plain single-fact face every other
 * display type shares on the compound row (the label lives in the header).
 * Strings only, by the same anti-fork law as the rest of this view-model.
 */
export type CompoundSlotValue =
  | ({ kind: 'stage_event' } & CompoundStageStepFacts)
  | { kind: 'value'; text: string | null };

/**
 * Facts for one lifecycle step column (`tested`, later `packed` / `scannedOut`).
 * Strings only — the cell joins the non-blank parts; a missing part is omitted,
 * never rendered as an empty `·` gap.
 */
export interface CompoundStageStepFacts {
  who: string | null;
  /**
   * The actor's staff id — resolves the AVATAR (photo → initials on the
   * staffer's colour) through the identity cache. The cell paints the person
   * as a mark and moves the name to the tooltip, so the visible line keeps a
   * fixed width. `null` with a `who` still shows initials; both null shows
   * the unclaimed placeholder.
   */
  whoStaffId?: number | null;
  at: string | null;
  station: string | null;
}

/**
 * Secondary line for a stage-step cell: `who · time · station`, blanks dropped.
 * Returns `null` when nothing landed — the cell drops the tooltip and leaves
 * its second line blank.
 */
export function formatCompoundStageStepLine(
  step: CompoundStageStepFacts | null | undefined,
): string | null {
  if (!step) return null;
  const bits = [step.who, step.at, step.station]
    .map((s) => String(s ?? '').trim())
    .filter(Boolean);
  return bits.length > 0 ? bits.join(' · ') : null;
}

/**
 * STATUS-column second line. The civil date is the face when the family
 * supplied one; lateness is tone (and a suffix when overdue). Families that
 * only know relative urgency keep "On time" / "Nd late". An editable blank
 * is `--`, never a fake "On time".
 */
export function formatCompoundDelayFace(
  delay: CompoundDelay | null,
  options: { editable?: boolean; missingText?: string } = {},
): { text: string; toneClass: string } {
  const missing = options.missingText ?? '--';
  if (delay?.dateLabel) {
    const late = delay.overdue && delay.days > 0;
    return {
      text: late ? `${delay.dateLabel} · ${delay.days}d late` : delay.dateLabel,
      toneClass: delay.overdue
        ? 'font-semibold text-text-danger'
        : delay.dueToday
          ? 'text-text-default'
          : 'text-text-faint',
    };
  }
  if (delay?.overdue) {
    return {
      text: `${delay.days}d late`,
      toneClass: 'font-semibold text-text-danger',
    };
  }
  if (options.editable) {
    return { text: missing, toneClass: 'text-text-faint' };
  }
  return { text: 'On time', toneClass: 'text-text-faint' };
}

/**
 * One entry in a row's three-dot menu.
 *
 * Presentational by the same rule as the view model: a label, a key and a
 * callback. No icons and no JSX, so a family cannot smuggle bespoke markup into
 * the shared row through its action list.
 */
export interface CompoundRowAction {
  key: string;
  label: string;
  onSelect: () => void;
  /** `'danger'` paints destructive (void, delete). Default is ordinary. */
  tone?: 'default' | 'danger';
  disabled?: boolean;
}

/**
 * A family's row → view mapping. Pure by contract: it runs inside a render for
 * every visible row, so it must not allocate anything expensive, hit a hook, or
 * read the DOM.
 */
export type CompoundRowAdapter<Row> = (row: Row) => CompoundRowView;

/**
 * First non-blank note, in the adapter's priority order.
 *
 * A row shows ONE note line and never concatenates: two notes joined by a
 * separator read as a single sentence that nobody wrote, and the clipped line
 * would usually cut the second one mid-word anyway. The adapter orders them
 * most-specific-first; this picks the first that has something to say.
 */
export function firstNote(values: readonly (string | null | undefined)[]): string | null {
  for (const v of values) {
    const s = String(v ?? '').trim();
    if (s) return s;
  }
  return null;
}
