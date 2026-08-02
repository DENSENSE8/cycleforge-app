/**
 * Carton inspector — the pure read model.
 *
 * The inspector is the READ view of a carton; `/unbox` is the WORK view.
 * Decision D6: share this read model + atoms with the work surface; assembly
 * may diverge. This module derives display facts and nothing else — no
 * fetching, no writes, no component imports.
 *
 * Shape mirrors `GET /api/receiving/[id]`, which already returns the whole
 * carton read model (identity + milestones + lines + serials + events). The
 * inspector adds no endpoint.
 *
 * **Timestamp discipline.** The carton milestone fields come back from
 * `to_char(ts::timestamp, 'YYYY-MM-DD HH24:MI:SS')` with the DB session on
 * `America/Los_Angeles` — i.e. they are **warehouse wall-clock strings, not
 * instants**. `formatDateTimePST` parses that naive shape purely (no `Date`
 * reparse), so it renders identically under any host TZ. Do NOT hand these to
 * anything that constructs a `Date` from them — that is the banned host-local
 * reparse in `.claude/rules/source-of-truth.md` → Dates. `events[].occurred_at`
 * IS a real ISO instant; the same formatter branches correctly for it.
 */

/** Carton header as returned by `GET /api/receiving/[id]` (`receiving`). */
export interface CartonInspectorReceiving {
  id: number;
  shipment_id: string | null;
  tracking: string | null;
  carrier: string | null;
  source: string | null;
  source_platform: string | null;
  intake_type: string | null;
  pairing_state: string | null;
  priority_lane: string | null;
  triage_complete: boolean | null;
  triage_completed_at: string | null;
  is_return: boolean | null;
  return_platform: string | null;
  return_reason: string | null;
  needs_test: boolean | null;
  target_channel: string | null;
  qa_status: string | null;
  disposition_code: string | null;
  condition_grade: string | null;
  staging_location_label: string | null;
  local_pickup_order_id: string | null;
  zoho_purchase_receive_id: string | null;
  zoho_purchaseorder_id: string | null;
  zoho_purchaseorder_number: string | null;
  listing_url: string | null;
  support_notes: string | null;
  tracking_scanned_at: string | null;
  tracking_scanned_by?: number | null;
  tracking_scanned_by_name: string | null;
  unbox_opened_at: string | null;
  unbox_opened_by?: number | null;
  unbox_opened_by_name: string | null;
  unboxed_at: string | null;
  unboxed_by?: number | null;
  unboxed_by_name: string | null;
  received_at: string | null;
  received_by?: number | null;
  received_by_name: string | null;
  created_at: string | null;
  updated_at: string | null;
}

interface CartonInspectorSerial {
  id: number;
  serial_number: string;
  current_status: string | null;
  current_location: string | null;
  condition_grade: string | null;
}

export interface CartonInspectorLine {
  id: number;
  sku: string | null;
  item_name: string | null;
  quantity_expected: number | null;
  quantity_received: number | null;
  qa_status: string | null;
  disposition_code: string | null;
  condition_grade: string | null;
  workflow_status: string | null;
  receiving_type: string | null;
  location_code: string | null;
  listing_reference: string | null;
  notes: string | null;
  zoho_purchaseorder_number: string | null;
  /** Per-line tracking (a multi-tracking carton splits across lines). */
  tracking_number: string | null;
  serials?: CartonInspectorSerial[];
}

/**
 * One row of `events[]`. Unlike the carton milestone stamps, `occurred_at` IS a
 * real ISO instant — `formatDateTimePST` branches correctly for both, but do
 * not assume the two are interchangeable elsewhere.
 */
export interface CartonInspectorEvent {
  id: string;
  occurred_at: string;
  event_type: string | null;
  actor_name: string | null;
  station: string | null;
  sku: string | null;
  serial_number: string | null;
  bin_name: string | null;
  prev_status: string | null;
  next_status: string | null;
  notes: string | null;
}

export interface CartonInspectorTotals {
  expected: number;
  received: number;
  lines: number;
  lines_complete: number;
}

export interface CartonInspectorPayload {
  success?: boolean;
  receiving: CartonInspectorReceiving;
  purchase_orders?: Array<{
    zoho_purchaseorder_id: string | null;
    zoho_purchaseorder_number: string | null;
    line_count: number;
  }>;
  lines?: CartonInspectorLine[];
  totals?: CartonInspectorTotals;
  events?: CartonInspectorEvent[];
}

/**
 * A displayable fact, with the presentation kind it must be resolved through.
 *
 * The model decides WHICH facts exist and what kind each is; the view resolves
 * `kind` against the matching SoT (`conditionLabel`, `sourcePlatformMeta`,
 * `receivingTypeMeta`, `workflowStage*`). Keeping the label/tone maps out of
 * here is what lets this module stay import-free and testable, and it is the
 * house rule either way — views assemble RESOLVED facts, they never invent maps,
 * and the model never hardcodes a label a SoT already owns.
 */
export type CartonFactKind = 'text' | 'condition' | 'platform' | 'receivingType';

export interface CartonFact {
  key: string;
  label: string;
  /** The RAW stored value — the view resolves it per `kind`. */
  value: string;
  kind: CartonFactKind;
}

/** Non-empty string, or null. Blank and whitespace count as absent. */
function present(value: string | null | undefined): string | null {
  const v = typeof value === 'string' ? value.trim() : '';
  return v.length > 0 ? v : null;
}

/**
 * The at-a-glance fact set.
 *
 * **Absent facts are omitted, never rendered as `—`.** A carton legitimately has
 * most of these empty, and a grid of dashes reads as "the system lost the data"
 * rather than "this step does not apply here" — the same reasoning that omits
 * unstamped milestones. The consequence is that the strip's length varies by
 * carton, which is correct: a returned unit with a disposition genuinely has
 * more to say than a plain PO carton.
 */
export function cartonFacts(receiving: CartonInspectorReceiving): CartonFact[] {
  const out: CartonFact[] = [];
  const add = (key: string, label: string, value: string | null, kind: CartonFactKind = 'text') => {
    if (value) out.push({ key, label, value, kind });
  };

  add('platform', 'Platform', present(receiving.source_platform), 'platform');
  add('intakeType', 'Intake type', present(receiving.intake_type), 'receivingType');
  add('carrier', 'Carrier', present(receiving.carrier));
  // Deliberately 'text'. `qa_status` (PENDING/PASSED/FAILED) is its own small
  // vocabulary — NOT a receiving workflow stage. Routing it through
  // `workflowStage*` rendered a valid "PENDING" as "Unknown", because that
  // registry only knows line stages. Misresolving a value through the wrong SoT
  // is the same class of bug as inventing a map; the raw token is legible and
  // honest, and a QA label SoT should be added only once a second consumer
  // needs one.
  add('qaStatus', 'QA status', present(receiving.qa_status));
  add('disposition', 'Disposition', present(receiving.disposition_code));
  add('condition', 'Condition', present(receiving.condition_grade), 'condition');
  add('staging', 'Staging location', present(receiving.staging_location_label));
  add('lane', 'Priority lane', present(receiving.priority_lane));
  add('targetChannel', 'Target channel', present(receiving.target_channel));
  add('returnPlatform', 'Return platform', present(receiving.return_platform), 'platform');
  add('returnReason', 'Return reason', present(receiving.return_reason));

  return out;
}

/**
 * Exception flags — the states a reader must not have to infer from a fact grid.
 *
 * Only genuinely notable states appear. `triage_complete: true` is the normal
 * case and says nothing, so it is silent; `false` on a carton that has already
 * been unboxed is a real inconsistency and is surfaced. This is the difference
 * between a status readout and a signal.
 */
interface CartonFlag {
  key: string;
  label: string;
  tone: 'info' | 'warning' | 'danger';
}

/**
 * True when the carton (or any line) already points at a PO. Stale
 * `pairing_state === 'UNFOUND'` must not outrank a real PO link on the read surface.
 */
function cartonHasLinkedPo(
  receiving: CartonInspectorReceiving,
  lines?: ReadonlyArray<Pick<CartonInspectorLine, 'zoho_purchaseorder_number'>> | null,
): boolean {
  if (present(receiving.zoho_purchaseorder_id) || present(receiving.zoho_purchaseorder_number)) {
    return true;
  }
  return Boolean(lines?.some((l) => present(l.zoho_purchaseorder_number)));
}

export function cartonFlags(
  receiving: CartonInspectorReceiving,
  lines?: ReadonlyArray<Pick<CartonInspectorLine, 'zoho_purchaseorder_number'>> | null,
): CartonFlag[] {
  const flags: CartonFlag[] = [];

  if (receiving.is_return) flags.push({ key: 'return', label: 'Return', tone: 'warning' });
  if (receiving.needs_test) flags.push({ key: 'needsTest', label: 'Needs test', tone: 'info' });

  // UNFOUND = arrived without a matching PO. Suppress when a PO is already linked
  // (carton or line) — pairing_state can lag behind the link.
  const pairing = present(receiving.pairing_state);
  if (pairing && pairing.toUpperCase() === 'UNFOUND' && !cartonHasLinkedPo(receiving, lines)) {
    flags.push({ key: 'unfound', label: 'No matched PO', tone: 'warning' });
  }

  // Only an inconsistency once the box is demonstrably open.
  const opened = present(receiving.unbox_opened_at) || present(receiving.unboxed_at);
  if (opened && receiving.triage_complete === false) {
    flags.push({ key: 'triage', label: 'Triage incomplete', tone: 'warning' });
  }

  if (present(receiving.local_pickup_order_id)) {
    flags.push({ key: 'pickup', label: 'Local pickup', tone: 'info' });
  }

  return flags;
}

/**
 * Header identity for the carton read chrome — raw parts only.
 *
 * The view composes the lead title (platform label · PO, or sole product name,
 * or carton id) and mounts PoChip · TrackingChip from `poNumber` / `tracking`
 * (order#/PO# before tracking#, matching CartonContextCard).
 * Platform stays raw so the view resolves it through `sourcePlatformLabel`.
 */
export interface CartonHeaderIdentity {
  cartonId: number;
  /** Raw `source_platform` token — view resolves the display label. */
  platform: string | null;
  poNumber: string | null;
  tracking: string | null;
  /** Sole product name when the carton has exactly one named line and no PO. */
  productTitle: string | null;
}

export function cartonHeaderIdentity(
  receiving: CartonInspectorReceiving,
  lines?: ReadonlyArray<Pick<CartonInspectorLine, 'item_name' | 'sku' | 'zoho_purchaseorder_number' | 'tracking_number'>> | null,
): CartonHeaderIdentity {
  const poNumber =
    present(receiving.zoho_purchaseorder_number) ??
    present(lines?.map((l) => l.zoho_purchaseorder_number).find((v) => present(v)) ?? null);

  const tracking =
    present(receiving.tracking) ??
    present(lines?.map((l) => l.tracking_number).find((v) => present(v)) ?? null);

  const productNames = [
    ...new Set(
      (lines ?? [])
        .map((l) => present(l.item_name) ?? present(l.sku))
        .filter((v): v is string => Boolean(v)),
    ),
  ];

  return {
    cartonId: receiving.id,
    platform: present(receiving.source_platform),
    poNumber,
    tracking,
    productTitle: !poNumber && productNames.length === 1 ? productNames[0]! : null,
  };
}

/** System-record footer facts — the "which row is this, really" set. */
export function cartonRecordMeta(receiving: CartonInspectorReceiving): CartonFact[] {
  const out: CartonFact[] = [];
  const add = (key: string, label: string, value: string | null) => {
    if (value) out.push({ key, label, value, kind: 'text' });
  };
  add('id', 'Carton', String(receiving.id));
  add('shipment', 'Shipment', present(receiving.shipment_id));
  add('source', 'Source', present(receiving.source));
  add('pairing', 'Pairing state', present(receiving.pairing_state));
  add('poId', 'Zoho PO id', present(receiving.zoho_purchaseorder_id));
  add('receiveId', 'Zoho receive id', present(receiving.zoho_purchase_receive_id));
  add('created', 'Created', present(receiving.created_at));
  add('updated', 'Updated', present(receiving.updated_at));
  return out;
}

/** One "who did what, when" row. */
interface CartonMilestone {
  key: 'scanned' | 'opened' | 'unboxed' | 'received';
  label: string;
  /** Warehouse wall-clock string — render via `formatDateTimePST`, never `new Date`. */
  at: string;
  byName: string | null;
}

/**
 * The carton's provenance, in lifecycle order.
 *
 * This is the question a lookup scan is actually asking — "what happened to
 * this box, and who did it?" — so it is the inspector's lead content, not a
 * footnote. Milestones with no timestamp are omitted rather than rendered as
 * `—`: an absent stamp means the step did not happen, and a column of dashes
 * reads as missing data instead of an incomplete lifecycle.
 *
 * Scanned is a TRIAGE (door) stamp while Opened / Unboxed are UNBOX stamps —
 * they are independent by design, so a carton can legitimately have the later
 * ones without the earlier.
 */
export function buildCartonMilestones(
  receiving: Pick<
    CartonInspectorReceiving,
    | 'tracking_scanned_at'
    | 'tracking_scanned_by_name'
    | 'unbox_opened_at'
    | 'unbox_opened_by_name'
    | 'unboxed_at'
    | 'unboxed_by_name'
    | 'received_at'
    | 'received_by_name'
  >,
): CartonMilestone[] {
  const candidates: Array<{ key: CartonMilestone['key']; label: string; at: string | null; byName: string | null }> = [
    { key: 'scanned', label: 'Scanned in', at: receiving.tracking_scanned_at, byName: receiving.tracking_scanned_by_name },
    { key: 'opened', label: 'Opened', at: receiving.unbox_opened_at, byName: receiving.unbox_opened_by_name },
    { key: 'unboxed', label: 'Unboxed', at: receiving.unboxed_at, byName: receiving.unboxed_by_name },
    { key: 'received', label: 'Received', at: receiving.received_at, byName: receiving.received_by_name },
  ];
  return candidates
    .filter((c): c is typeof c & { at: string } => typeof c.at === 'string' && c.at.trim().length > 0)
    .map((c) => ({ key: c.key, label: c.label, at: c.at, byName: c.byName?.trim() || null }));
}

/**
 * Lifecycle states a carton can be in, least → most advanced.
 *
 * The read view's FIRST job is answering "is this done?" (the reason the
 * operator scanned a finished box at all). Deriving that from the milestone
 * stamps here — rather than making the operator infer it from four timestamp
 * rows — is what lets the surface lead with an answer instead of an audit log.
 */
type CartonLifecycleState = 'expected' | 'scanned' | 'opened' | 'unboxed' | 'received';

interface CartonLifecycle {
  state: CartonLifecycleState;
  label: string;
  /** Semantic TONE, not a class — the view maps it (views stay dumb). */
  tone: 'neutral' | 'info' | 'success';
  /** The unbox work is finished — what makes a re-scan a lookup. */
  done: boolean;
}

const LIFECYCLE: Record<CartonLifecycleState, Omit<CartonLifecycle, 'state'>> = {
  expected:  { label: 'Expected',   tone: 'neutral', done: false },
  scanned:   { label: 'Scanned in', tone: 'info',    done: false },
  opened:    { label: 'Opened',     tone: 'info',    done: false },
  unboxed:   { label: 'Unboxed',    tone: 'success', done: true },
  received:  { label: 'Received',   tone: 'success', done: true },
};

/** Most-advanced milestone reached. Received ⊃ unboxed ⊃ opened ⊃ scanned. */
export function cartonLifecycle(
  receiving: Parameters<typeof buildCartonMilestones>[0],
): CartonLifecycle {
  const reached = new Set(buildCartonMilestones(receiving).map((m) => m.key));
  const state: CartonLifecycleState = reached.has('received')
    ? 'received'
    : reached.has('unboxed')
      ? 'unboxed'
      : reached.has('opened')
        ? 'opened'
        : reached.has('scanned')
          ? 'scanned'
          : 'expected';
  return { state, ...LIFECYCLE[state] };
}

/** Received-vs-expected summary for the contents header. */
export function cartonContentsSummary(totals: CartonInspectorTotals | undefined | null): string {
  if (!totals || totals.lines === 0) return 'No lines';
  const { expected, received, lines, lines_complete: complete } = totals;
  const unitPart = expected > 0 ? `${received}/${expected} units` : `${received} units`;
  return `${unitPart} · ${complete}/${lines} ${lines === 1 ? 'line' : 'lines'} complete`;
}

/**
 * Exception codes that outrank lifecycle "done" on the read surface.
 *
 * A carton can be stamped received and still be unsettled — UNFOUND pairing,
 * triage never finished after open, opened with zero lines, or needs-test with
 * QA still PENDING. The header must never say "complete" while any of these
 * hold (acceptance: disposition truth).
 */
export type CartonExceptionKey =
  | 'unfound'
  | 'triage_incomplete'
  | 'no_lines'
  | 'qa_pending';

export interface CartonException {
  key: CartonExceptionKey;
  label: string;
  /** Short next-action hint for the findings rail. */
  ctaHint: string;
  tone: 'warning' | 'danger' | 'info';
}

export function cartonExceptions(
  receiving: CartonInspectorReceiving,
  totals: CartonInspectorTotals | undefined | null,
  lines?: ReadonlyArray<Pick<CartonInspectorLine, 'zoho_purchaseorder_number'>> | null,
): CartonException[] {
  const out: CartonException[] = [];
  const pairing = present(receiving.pairing_state);
  if (pairing && pairing.toUpperCase() === 'UNFOUND' && !cartonHasLinkedPo(receiving, lines)) {
    out.push({
      key: 'unfound',
      label: 'No matched PO',
      ctaHint: 'Record or match contents in Unbox',
      tone: 'warning',
    });
  }

  const opened = present(receiving.unbox_opened_at) || present(receiving.unboxed_at);
  if (opened && receiving.triage_complete === false) {
    out.push({
      key: 'triage_incomplete',
      label: 'Triage incomplete',
      ctaHint: 'Finish triage or clear the flag in Unbox',
      tone: 'warning',
    });
  }

  if (opened && (!totals || totals.lines === 0)) {
    out.push({
      key: 'no_lines',
      label: 'No contents recorded',
      ctaHint: 'Open Unbox and record what was in the carton',
      tone: 'danger',
    });
  }

  if (receiving.needs_test && present(receiving.qa_status)?.toUpperCase() === 'PENDING') {
    out.push({
      key: 'qa_pending',
      label: 'QA pending',
      ctaHint: 'Needs test — QA still pending',
      tone: 'info',
    });
  }

  return out;
}

/**
 * Operator-facing disposition — the answer the header leads with.
 *
 * `complete` only when lifecycle says done AND there are zero exceptions.
 * Otherwise: unmatched (UNFOUND with no linked PO), needs_action (other
 * exceptions), or in_progress (lifecycle not done, no blocking exceptions yet).
 */
export type CartonDispositionState = 'complete' | 'unmatched' | 'needs_action' | 'in_progress';

export interface CartonDisposition {
  state: CartonDispositionState;
  label: string;
  tone: 'success' | 'warning' | 'danger' | 'info' | 'neutral';
  /** True only when it is honest to show a "complete / work complete" chip. */
  settled: boolean;
  exceptions: CartonException[];
  lifecycle: CartonLifecycle;
}

export function cartonDisposition(
  receiving: CartonInspectorReceiving,
  totals: CartonInspectorTotals | undefined | null,
  lines?: ReadonlyArray<Pick<CartonInspectorLine, 'zoho_purchaseorder_number'>> | null,
): CartonDisposition {
  const lifecycle = cartonLifecycle(receiving);
  const exceptions = cartonExceptions(receiving, totals, lines);

  if (exceptions.some((e) => e.key === 'unfound')) {
    return {
      state: 'unmatched',
      label: 'Unmatched',
      tone: 'warning',
      settled: false,
      exceptions,
      lifecycle,
    };
  }

  if (exceptions.length > 0) {
    return {
      state: 'needs_action',
      label: 'Needs action',
      tone: exceptions.some((e) => e.tone === 'danger') ? 'danger' : 'warning',
      settled: false,
      exceptions,
      lifecycle,
    };
  }

  if (lifecycle.done) {
    return {
      state: 'complete',
      label: lifecycle.label,
      tone: 'success',
      settled: true,
      exceptions,
      lifecycle,
    };
  }

  return {
    state: 'in_progress',
    label: lifecycle.label,
    tone: lifecycle.tone === 'neutral' ? 'neutral' : 'info',
    settled: false,
    exceptions,
    lifecycle,
  };
}
