import type { LifecycleState } from '@cycleforge/design-tokens';
import { formatOpsStageTime } from '@/utils/date';

/** The COMPOUND row view-model — one shape every table adapts into. */

/** How late a row is, and WHEN the deadline is. */
export interface CompoundDelay {
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

/** Where a row goes next — the STATUS cell's second line. */
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
  /** TITLE column hyperlink — the listing this row sells. */
  titleHref?: string | null;
  /** TITLE reads as COMPLETED — muted text under an animated strike ({@link StruckLabel}). */
  titleStruck?: boolean;
  /** TITLE column, bottom — the operator note on this row. */
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
  /** PRODUCT-LEVEL status on the item track — exception / out of stock. */
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
   * LEADING EDGE RAIL — a full-height bar at the row's left edge, painted by the select-gutter CELL (never by the check inside it, or a…
   * TRIAGE HEAT, order-level and product-level (operator 2026-09-15): urgent is
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
  /** NON-MARKETPLACE identity for the fulfillment track's top line. */
  identityFace?: {
    /** The handle as painted AND copied — `7`, `BOSE-X`, `A-12-3`. */
    value: string;
    /** Hover/aria word for what the handle is ("Checklist item id"). */
    label: string;
  } | null;
  /**
   * Column 3 BOTTOM, for a family whose identity is a local handle — the second-line twin of {@link identityFace}.
   * marketplace chip (operator 2026-09-14) and line 2 kept none, so a family
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

  /** DATES column, top — when the row STARTED (an order's purchase date, a PO's raised date). */
  orderedAt?: {
    label: string;
    tip?: string;
    /** `YYYY-MM-DD` — seeds the calendar and is what an edit commits against. */
    dateKey?: string | null;
  } | null;

  /** Hover SoT for the DATES Hash (start) line — parallel to {@link delayTip}. */
  startedHover?: string;

  /** Column 5 top — the state pill. */
  stateLabel: string;
  stateTone: CompoundStateTone;
  /** The lifecycle state the pill names, when it is one (`packed`, `shipped`, …). */
  stateLifecycle?: LifecycleState;
  /** Hover detail for the state pill. */
  stateTip?: string;
  /** DATES column, bottom — the DELAY, not a generic timestamp. */
  delay: CompoundDelay | null;
  /** Hover detail for the delay (the actual deadline instant). */
  delayTip?: string;

  /** STATUS column, bottom — where this row goes NEXT. */
  nextStep?: CompoundNextStep | null;

  /** AMOUNT column, top — the money this row is worth, already formatted. */
  amount: string | null;
  /** AMOUNT column, bottom — the arithmetic behind it (`×3 @ $49.99`). */
  amountNote?: string | null;
  /** Is this amount a CREDIT (money going the other way)? */
  amountCredit?: boolean;

  /** Materialized SLOT cells, keyed by TRACK key (`status:1`, `status:2`, …). */
  slots?: Readonly<Record<string, CompoundSlotValue>>;

  /** BOUND subtitle parts for the item cell's second line — the org-configured replacement for {@link note}. */
  subtitleParts?: readonly CompoundSubtitlePart[];

  /** Shallow product facts for the leaf detail band (serial / location / unit). */
  detail?: CompoundRowDetail | null;
}

/** Build a {@link CompoundRowView.identityFace} from a maybe-blank handle. */
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

/** House money face — sale, credit, or empty slot. */
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
  /** Reserve a fixed character width for this part. */
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

/** An in-place SELECT editor for one subtitle part — the capability object a family passes when a bound subtitle fact is a scalar with a… */
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

/** A subtitle part the operator can retype in place. */
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

/** In-place editor for the STATUS column's ship-by date. */
export interface CompoundShipByEdit {
  /** Civil key currently on the row (`YYYY-MM-DD`); empty when missing. */
  value: string;
  onCommit: (dateKey: string | null) => void;
}

/** The DATES cell's TOP line as an editable day — the order date. */
export interface CompoundOrderedAtEdit {
  /** Civil key currently on the row (`YYYY-MM-DD`); empty when missing. */
  value: string;
  onCommit: (dateKey: string | null) => void;
}

/** One resolved slot cell, discriminated by paint kind. */
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
  /** The actor's staff id — resolves the AVATAR (photo → initials on the staffer's colour) through the identity cache. */
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

export interface CompoundStageAssign {
  /** Current assignee for this lane (not the scan-completion actor). */
  selectedStaffId: number | null;
  /** Accessible name for the assign combobox — e.g. Pick / Packer; not painted. */
  label: string;
  /**
   * Assign mode lists staff holding this lane's functional role; the combo's
   * pencil roster edits functional roles itself (never RBAC).
   */
  role: CompoundStageAssignRole;
  onCommit: (staffId: number | null, staffName: string | null) => void;
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

/** A day count as the shortest unit that still reads true: */
export function formatDayGap(days: number): string {
  const d = Math.max(0, Math.round(days));
  if (d < 30) return `${d}d`;
  if (d < 365) return `${Math.floor(d / 30)}m`;
  return `${Math.floor(d / 365)}y`;
}

/**
 * The DATES cell's deadline line — the AGE, never the date.
 * Operator 2026-09-04: *"the ship by date must not display the date it should
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

/** Tips that already name the Hash (start) line — return as-is, never prefix `Start date · …` (same escape hatch as Dwell on the Calendar… */
const DATES_START_TIP_OWNS_NAME =
  /^(Start date|Last seen|Enrolled|Ordered|Imported|Opened|Raised|Counted|Never counted|Created)\b/i;

/** Hover copy for one DATES line. */
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

/** One entry in a row's three-dot menu. */
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

/** First non-blank note, in the adapter's priority order. */
export function firstNote(values: readonly (string | null | undefined)[]): string | null {
  for (const v of values) {
    const s = String(v ?? '').trim();
    if (s) return s;
  }
  return null;
}
