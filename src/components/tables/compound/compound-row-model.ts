import type { LifecycleState } from '@cycleforge/design-tokens';
import { formatOpsStageTime } from '@/utils/date';

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
  /**
   * Whole days from warehouse-today UNTIL the deadline, for a deadline that has
   * not passed. `days` cannot carry this: lateness clamps at zero
   * (`getDaysLateNullable`), so a queue of future ship-bys is all `0` and the
   * age face would have nothing to count. Absent ⇒ the face says `On time`
   * rather than inventing a countdown.
   */
  daysUntil?: number | null;
  /**
   * Non-deadline secondary temporal face for the Calendar line (dwell, enrolled,
   * …). When set, paints THIS string instead of the ship-by age vocabulary —
   * so a family without a warehouse deadline still uses both DATES lines
   * instead of leaving `--` and stuffing the fact into the Hash tip.
   */
  faceLabel?: string | null;
}

/**
 * Where a row goes next — the STATUS cell's second line.
 *
 * Strings and flags, like every other part of this model: the family resolves
 * its own pipeline (which station, what it is called) and hands over a face.
 * The chrome never imports a lifecycle SoT.
 */
export interface CompoundNextStep {
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
   * item number and Receiving derives its primary link from the receiving listing
   * resolver.
   */
  titleHref?: string | null;
  /**
   * TITLE reads as COMPLETED — muted text under an animated strike
   * ({@link StruckLabel}).
   *
   * Opt-in, and deliberately not derived from {@link stateTone} `'done'`: a
   * shipped order and a packed carton are done too, and striking their titles
   * would say the LINE is retired rather than the step finished. Only a family
   * whose row IS a check — the daily checklist — sets this.
   *
   * `undefined` ⇒ no strike host at all, so every other family's title paints
   * byte-for-byte as before.
   */
  titleStruck?: boolean;
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
  /**
   * PRODUCT-LEVEL status on the item track — exception / out of stock.
   * Icon only beside the title; the word is the tooltip + sr-only.
   * Order-level expedite is {@link edgeMark}, never this.
   * OOS may carry a structured {@link card} for the product hover (not a note).
   */
  itemStatus?: {
    label: string;
    /** Plain-text fallback / exception tip. */
    tip: string;
    /** Structured shortage card — CompoundCells mounts OutOfStockHoverCard. */
    card?: {
      thumbUrl: string | null;
      sku: string | null;
      title: string;
      qtyShort: number;
      kind: 'listing' | 'kit_part' | 'rollup';
      rollupSkus?: readonly string[];
      pipelineLabel?: string | null;
    } | null;
  } | null;
  /**
   * Shopify-like bundle / kit face under the item title.
   * Present when the listing's sku_catalog has composition components
   * (sku_relationships preferred, else sku_kit_parts). Never Zoho `-P`.
   */
  kitFace?: {
    label: string;
    source: 'catalog_edge' | 'kit_part';
    components: readonly {
      key: string;
      title: string;
      sku: string | null;
      qty: number;
      thumbUrl: string | null;
    }[];
  } | null;
  /**
   * LEADING EDGE RAIL — a full-height bar at the row's left edge, painted by
   * the select-gutter CELL (never by the check inside it, or a detail row would
   * clip the bar at the chevron).
   *
   * TRIAGE HEAT, order-level and product-level (operator 2026-09-15): urgent is
   * the yellow bob; a shortage / exception is the same bob in red. Before that
   * ruling the rail was urgent-only and a short line had nothing but a triangle
   * beside its title — which is exactly the row an operator most needs to spot
   * from across the desk.
   *
   * Colour is an ACCELERATOR, never the fact — `label` is the accessible name
   * and the hover word, and `kind` is what the resting gutter glyph reads
   * ({@link compoundSelectStatusMark}).
   */
  edgeMark?: {
    /** Operator word — "Urgent", "Out of stock". The fact, not the paint. */
    label: string;
    /**
     * Which triage mark this is: `'urgent'` (expedite) or `'attention'`
     * (shortage / exception). Chooses the resting glyph — bolt vs triangle —
     * so the gutter and the rail can never disagree about what the row is.
     */
    kind: 'urgent' | 'attention';
    /** Solid background class for the 3px bar, from the family's SoT. */
    barClass: string;
    /** Slow 1px traveler on `y`. Any slot-table family may set this. */
    pulse?: boolean;
    /** Lighter fill for the 1px traveler. Required when `pulse`. */
    tickClass?: string;
  } | null;

  /**
   * A just-imported order earns a blue, timed rail without displacing a hotter
   * urgent or cannot-ship rail. Its label carries the elapsed import time.
   */
  importMark?: {
    label: string;
    barClass: string;
    tickClass?: string;
  } | null;

  /** Column 3 top — the fulfillment handle (order #, PO). */
  orderId: string | null;
  /**
   * NON-MARKETPLACE identity for the fulfillment track's top line.
   *
   * Opt-in. `orderId` is an ORDER: {@link CompoundFulfillment} resolves it to a
   * marketplace brand dot and an `OrderNumberMenuChip` whose verbs are "copy
   * order number" and "open on the platform". A family whose identity is a
   * local handle — the daily checklist's `daily_check_items.id`, painted `#7`
   * — would inherit a dot for a platform it has none of and a menu that offers
   * to open it on eBay.
   *
   * Present ⇒ the track paints THIS value plainly and copyably, no dot and no
   * marketplace menu, and the family relabels the header (`gridLabel: 'ID'`)
   * so the word matches the fact. `orderId` stays the order for every family
   * that has one.
   */
  identityFace?: {
    /** The handle as painted AND copied — `7`, `BOSE-X`, `A-12-3`. */
    value: string;
    /** Hover/aria word for what the handle is ("Checklist item id"). */
    label: string;
  } | null;
  /**
   * Column 3 BOTTOM, for a family whose identity is a local handle — the
   * second-line twin of {@link identityFace}.
   *
   * The Id track has always stacked two identifiers: "which order?" over
   * "which box?". `identityFace` gave line 1 an escape hatch from the
   * marketplace chip (operator 2026-09-14) and line 2 kept none, so a family
   * with a local handle had exactly one line and its second identifier had
   * nowhere to go. Inventory › Stock is where that bit: a shelf row's two
   * identifiers are the BIN CODE and the SKU, and the operator asked for the
   * SKU under the location id (2026-09-15).
   *
   * Present ⇒ the bottom line paints THIS value plainly and copyably, no
   * carrier ring and no tracking menu. `tracking` stays the carrier number for
   * every family that ships one; a family must not set both.
   */
  identitySubFace?: {
    /** The handle as painted AND copied — `BOSE-X`, `00045-P-2-BK`. */
    value: string;
    /** Hover/aria word for what the handle is ("SKU"). */
    label: string;
  } | null;
  /** Column 3 bottom — carrier tracking (this line's primary). */
  tracking: string | null;
  /**
   * Every tracking number on this commercial object, first-seen order.
   * Parent chrome stacks them; a singleton paints `tracking` (the first).
   */
  trackings?: readonly string[] | null;
  /**
   * True when a multi-line parent already painted the order/PO. The leaf
   * fulfillment cell keeps the BOX (tracking) as its primary face so one
   * line still has an identity, and dashes the order number the parent spoke.
   */
  quietIdentity?: boolean;
  /** Raw source-platform value — resolved to the ORDER identity brand dot. */
  platformValue: string | null;
  /**
   * Authoritative carrier from the shipment/label, when the family has one.
   * Resolved to the TRACKING identity brand dot; `null` falls back to detecting
   * the brand from the number itself.
   */
  carrier: string | null;

  /**
   * DATES column, top — when the row STARTED (an order's purchase date, a PO's
   * raised date). Pre-formatted to a compact civil face by the adapter, same
   * contract as {@link amount}: the view model is strings, and how a tenant
   * writes a date is not a table cell's decision.
   *
   * `null` (or absent) paints the meta dash. A family that has no such stamp
   * says nothing rather than borrowing the deadline — the two lines of this
   * cell are START over DUE, and a due date on both lines is a lie by
   * repetition.
   */
  orderedAt?: {
    label: string;
    tip?: string;
    /** `YYYY-MM-DD` — seeds the calendar and is what an edit commits against. */
    dateKey?: string | null;
  } | null;

  /**
   * Hover SoT for the DATES Hash (start) line — parallel to {@link delayTip}.
   *
   * When set, {@link CompoundDates} prefers this over `orderedAt.tip` so a
   * family can name the chip (`Last seen · Enrolled`) without fighting the
   * portable default {@link COMPOUND_DATES_START_HOVER}. Pass the tip through
   * {@link compoundDatesHoverLabel} so empty still gets `Start date`.
   */
  startedHover?: string;

  /** Column 5 top — the state pill. */
  stateLabel: string;
  stateTone: CompoundStateTone;
  /**
   * The lifecycle state the pill names, when it is one (`packed`, `shipped`, …).
   * The tone above stays the grid's small no-colour vocabulary; this only
   * lets the pill's DOT wear the state's own LIFECYCLE colour (packed purple,
   * shipped green) so the same state never reads two hues across surfaces.
   */
  stateLifecycle?: LifecycleState;
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
   * DATES column, bottom — the DELAY, not a generic timestamp.
   *
   * When {@link CompoundDelay.dateLabel} is present the cell paints that civil
   * day (lateness is tone + a "Nd late" suffix). Families that only know
   * relative urgency omit the date and keep the on-time / Nd-late face.
   * `null` with no editor is the on-time face, never a blank line.
   *
   * It rode the STATUS column's second line until 2026-09-04. Nothing about
   * the fact changed — it is the same delay, the same editor and the same
   * tone — but a deadline is a DATE, and it now sits with the other date, one
   * column left, which is what frees the status cell to say {@link nextStep}.
   */
  delay: CompoundDelay | null;
  /** Hover detail for the delay (the actual deadline instant). */
  delayTip?: string;

  /**
   * STATUS column, bottom — where this row goes NEXT.
   *
   * The state pill says where the row IS; on a floor the immediately useful
   * second question is where it is HEADED — which station picks it up, or that
   * nothing does because it is finished. That was unanswerable while the
   * deadline occupied this line.
   *
   * `done: true` is the terminal marker (scanned out, delivered): the cell
   * paints a finished face rather than a station name, because "next: nothing"
   * is a fact worth stating plainly and an empty line reads as missing data.
   *
   * Absent ⇒ the line is blank. A family that has not modelled its pipeline
   * must not have a next step invented for it.
   */
  nextStep?: CompoundNextStep | null;

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

  /**
   * Shallow product facts for the leaf detail band (serial / location / unit).
   * Present (even with empty serials) ⇒ the select gutter paints a disclosure
   * chevron. Absent ⇒ no disclosure (Units already uses serial as identity).
   * Strings only — never JSX.
   */
  detail?: CompoundRowDetail | null;
}

/**
 * Build a {@link CompoundRowView.identityFace} from a maybe-blank handle.
 *
 * One helper rather than nineteen ternaries: every family that paints a LOCAL
 * handle in the Id track (sku, bin, hold id, session, staff id, device id,
 * checklist item, personal task) has the same two rules — trim it, and a blank
 * handle is `null`, an honest dash, never an empty chip. Keeping them here is
 * what stops one adapter deciding that `''` is a handle worth painting.
 */
export function compoundIdentityFace(
  value: string | number | null | undefined,
  label: string,
): CompoundRowView['identityFace'] {
  const handle = String(value ?? '').trim();
  return handle ? { value: handle, label } : null;
}

/**
 * Extra facts under a compound leaf — copy serial, bin/location, jump to unit.
 * Not a third identity chip and not the full More-information inspector.
 */
export interface CompoundRowDetail {
  /** Attached unit serials, first-seen order. Empty = honest dash. */
  serials: readonly string[];
  /** Staging / pack / pick location label. */
  location: string | null;
  /**
   * Handle for `/search?sel=unit:…` — serial number, unit_uid, or serial_units id.
   * Null hides "View unit".
   */
  unitRef: string | null;
  /** Listing / catalog SKU when useful beside location. */
  sku: string | null;
}

/**
 * House money face — sale, credit, or empty slot.
 *
 * One hue so a figure is findable down a dense line of otherwise-neutral
 * facts. `text-text-success` is the theme token (`--ds-color-text-success`),
 * never a raw emerald. Weight pairs it with qty on the under-title line.
 * One module export — do not redeclare this constant in this file.
 */
export const COMPOUND_MONEY_TONE_CLASS = 'font-semibold text-text-success';

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
 *
 * `scrub` is the Figma width-field gesture on the idle face: drag on X to
 * change the number, click (no drag) to type. Do not mount `ScrubSlider`
 * here — that maps clientX onto a track, not delta-X on the number itself.
 */
export interface CompoundSubtitleScrub {
  /** 1px of drag (or one arrow key) in the default band. */
  step: number;
  /** Shift+drag / Shift+arrow. */
  coarseStep: number;
  /**
   * Control+drag / Control+arrow (Alt still aliases). Omit to ignore.
   * Control-up parks the origin and keeps this band for a grace period so
   * leftover pointer travel is not dollars.
   */
  fineStep?: number;
  min?: number;
  max?: number;
  /** Snap + commit precision (`2` for money). */
  decimals: number;
  /** Live face is currency (`$49.99`), not a bare figure. */
  money?: boolean;
}

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
  /** Present ⇒ drag-to-scrub the idle face; absent ⇒ click-to-type only. */
  scrub?: CompoundSubtitleScrub;
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
 * The DATES cell's TOP line as an editable day — the order date.
 *
 * Same shape and same law as {@link CompoundShipByEdit}, and separate for the
 * same reason the two lines are separate facts: an order date is what the
 * channel said, a ship-by is what we owe. Present ⇒ the line is a live
 * `DateRangePickerField variant="compact"`; absent ⇒ the identical field,
 * disabled — the display never changes, only whether it commits (operator
 * 2026-09-04: the calendar is there so staff can fix a wrong date in place).
 */
export interface CompoundOrderedAtEdit {
  /** Civil key currently on the row (`YYYY-MM-DD`); empty when missing. */
  value: string;
  onCommit: (dateKey: string | null) => void;
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
  | { kind: 'value'; text: string | null }
  /**
   * Person face — staff id drives {@link StaffAvatar}; name is the visible
   * label. Never paint a bare staff id or `Staff #N` as the face.
   */
  | { kind: 'person'; staffId: number | null; name: string | null };

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
  /** Long civil stamp — hover / `formatCompoundStageStepLine`. */
  at: string | null;
  /**
   * Raw instant for the painted face ({@link formatCompoundStageStampFace}).
   * Absent ⇒ the cell falls back to {@link at}.
   */
  atInstant?: string | null;
  station: string | null;
}

/**
 * Presence ⇒ the stage MARK is a staff combo while the step is still pending
 * (`!at`). Done stages stay read-only. One lane per column — never a dual
 * tester+packer picker inside a single Pick or Packed cell.
 */
export type CompoundStageAssignRole = 'technician' | 'packer';

/** Roster switch copy: Packed face = packer on/off, not the persisted opposite role. */
export type StaffLaneRoleNotice = {
  face: CompoundStageAssignRole;
  eligible: boolean;
};

export interface CompoundStageAssign {
  /** Current assignee for this lane (not the scan-completion actor). */
  selectedStaffId: number | null;
  /** Accessible name for the assign combobox — e.g. Pick / Packer; not painted. */
  label: string;
  role: CompoundStageAssignRole;
  onCommit: (staffId: number | null, staffName: string | null) => void;
  /**
   * Persist a member's floor role from roster mode (All staff).
   * Assign mode still name-clicks only when they already match `role`.
   */
  onSetLaneRole?: (
    staffId: number,
    role: CompoundStageAssignRole,
    staffName: string,
    notice?: StaffLaneRoleNotice,
  ) => void;
}

/**
 * Far-right actions-column roster. Sets a member's floor role (picker /
 * packer) only — it does not assign the order.
 */
export interface CompoundStaffRoster {
  onSetLaneRole: (
    staffId: number,
    role: CompoundStageAssignRole,
    staffName: string,
    notice?: StaffLaneRoleNotice,
  ) => void;
}

/** Assign chrome only when the host armed a handler and the step has no stamp. */
export function canAssignCompoundStage(
  assign: CompoundStageAssign | null | undefined,
  at: string | null | undefined,
): boolean {
  return Boolean(assign) && !at;
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
 * Painted stamp on a stage track — time or "12m ago", never `Sep 4, 9:41 AM`.
 * The long civil stamp stays on {@link formatCompoundStageStepLine} (hover).
 * 8rem cannot hold month+day+time after the 28px avatar (operator 2026-09-04).
 */
export function formatCompoundStageStampFace(
  step: CompoundStageStepFacts | null | undefined,
): string | null {
  if (!step) return null;
  const instant = String(step.atInstant ?? '').trim();
  if (instant) {
    const short = formatOpsStageTime(instant);
    if (short && short !== '--:--') return short;
  }
  const at = String(step.at ?? '').trim();
  return at || null;
}

/**
 * A day count as the shortest unit that still reads true: `4d`, `2m`, `1y`.
 *
 * A queue is worked in days, and a row that has been late for eleven weeks does
 * not become more legible as `77d` — the digits grow while the meaning stops
 * changing. Rolling up at a month keeps the face two characters wide at every
 * magnitude, which is what lets the column stay 7rem.
 *
 * Deliberately coarse: 30-day months and 365-day years, because this is a
 * MAGNITUDE for a glance and the exact civil date is one hover away. A calendar-
 * accurate month difference would disagree with the `Nd` it replaces at the
 * boundary and buy nothing an operator can act on.
 */
export function formatDayGap(days: number): string {
  const d = Math.max(0, Math.round(days));
  if (d < 30) return `${d}d`;
  if (d < 365) return `${Math.floor(d / 30)}m`;
  return `${Math.floor(d / 365)}y`;
}

/**
 * The DATES cell's deadline line — the AGE, never the date.
 *
 * Operator 2026-09-04: *"the ship by date must not display the date it should
 * display the age or days — if ship by date is 9/2 then '2d late' or '1m late'
 * for month, and on hover tooltip for more details."*
 *
 * The reasoning is the queue's: a ship-by prints as a civil day, but nobody
 * triages on `Sep 2` — they triage on how far past it is now, and reading the
 * one off the other is arithmetic the operator was doing in their head on every
 * row. The date is not lost; it moves to the hover, where the detail belongs.
 * It REPLACED `formatCompoundDelayFace`, which printed `Aug 17 · 2d late` and
 * had no callers left once the deadline moved into the DATES cell. Deleted
 * rather than kept behind a flag: two faces for one fact is how the grid ends
 * up showing both, on different surfaces, for no reason anyone can name.
 *
 * Faces, in precedence order: overdue → `2d late` · due today → `Due today` ·
 * a future deadline → `in 3d` · a deadline with no countdown → `On time` ·
 * nothing at all → the missing mark.
 */
export function formatCompoundDelayAgeFace(
  delay: CompoundDelay | null,
  options: { missingText?: string } = {},
): { text: string; toneClass: string } {
  const missing = options.missingText ?? '--';
  // Secondary temporal face (dwell, enrolled, …) — not a ship-by age. Wins
  // over the deadline vocabulary so families without a warehouse deadline
  // still paint the Calendar line instead of `--`.
  const faceLabel = String(delay?.faceLabel ?? '').trim();
  if (faceLabel) {
    return {
      text: faceLabel,
      toneClass: delay?.overdue
        ? 'font-semibold text-text-danger'
        : 'text-text-muted',
    };
  }
  if (delay?.overdue && delay.days > 0) {
    return {
      text: `${formatDayGap(delay.days)} late`,
      toneClass: 'font-semibold text-text-danger',
    };
  }
  if (delay?.dueToday) {
    return { text: 'Due today', toneClass: 'text-text-default' };
  }
  if (delay?.daysUntil != null && delay.daysUntil > 0) {
    return { text: `in ${formatDayGap(delay.daysUntil)}`, toneClass: 'text-text-faint' };
  }
  if (delay?.dateKey || delay?.dateLabel) {
    return { text: 'On time', toneClass: 'text-text-faint' };
  }
  return { text: missing, toneClass: 'text-text-faint' };
}

/**
 * DATES Hash hover — portable START fact across PRODUCT_TABLES.
 * Not Orders-only "Order date" (kiosk last-seen, tasks opened, POs raised, …).
 */
export const COMPOUND_DATES_START_HOVER = 'Start date';
/**
 * @deprecated Alias of {@link COMPOUND_DATES_START_HOVER} — kept so older
 * imports/tests keep compiling while session law pins the Start date string.
 */
export const COMPOUND_DATES_ORDER_HOVER = COMPOUND_DATES_START_HOVER;
/** Deadline line — portable across PRODUCT_TABLES (orders ship-by, tasks due, …). */
export const COMPOUND_DATES_DUE_HOVER = 'Due date';

/**
 * Tips that already name the Hash (start) line — return as-is, never prefix
 * `Start date · …` (same escape hatch as Dwell on the Calendar line).
 *
 * `Counted` / `Never counted` joined the list on 2026-09-15: `sku-bins` puts a
 * CYCLE-COUNT stamp on this line (`startedHover: 'Counted Sep 10 · 3:04 PM'`),
 * and the prefix buried that explicit name under a shipping word, so hovering a
 * shelf read "Start date · Counted …". `Created` (2026-09-24) is the
 * `sku-exceptions` stamp — when the placeholder SKU was minted on the floor.
 */
const DATES_START_TIP_OWNS_NAME =
  /^(Start date|Last seen|Enrolled|Ordered|Imported|Opened|Raised|Counted|Never counted|Created)\b/i;

/**
 * Hover copy for one DATES line. Portable defaults (`Start date` / `Due date`)
 * lead when the tip is empty or anonymous. Family tips that already name the
 * line (`Last seen`, `Dwell`, `Ordered`, …) own the chip verbatim.
 *
 * Short enough to ride {@link MorphCursorLayer} when there is no extra; a long
 * family tip falls back to the anchored bubble via HoverTooltip.
 */
export function compoundDatesHoverLabel(
  kind: 'start' | 'due' | 'order',
  detail?: string | null,
): string {
  const start = kind === 'start' || kind === 'order';
  const name = start ? COMPOUND_DATES_START_HOVER : COMPOUND_DATES_DUE_HOVER;
  const extra = (detail ?? '').trim();
  if (!extra) return name;
  if (extra === name || extra.startsWith(`${name} ·`)) return extra;
  if (start && DATES_START_TIP_OWNS_NAME.test(extra)) return extra;
  if (!start && /^(Ship by|Due date|Dwell)\b/i.test(extra)) {
    // Ship by → Due date rename; Dwell (and peers) already name the line.
    if (/^Dwell\b/i.test(extra)) return extra;
    return extra.replace(/^(Ship by|Due date)/i, name);
  }
  return `${name} · ${extra}`;
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
  /**
   * Where the verb paints. Default `'menu'` rides the title-hover ⋮.
   * `'trailing'` paints a sticky control in the `_fill` slack track (credential
   * verbs like Revoke) — never remounts a compound `actions` column.
   */
  face?: 'menu' | 'trailing';
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
