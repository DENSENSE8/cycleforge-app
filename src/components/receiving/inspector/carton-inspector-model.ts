/** Carton inspector — the pure read model. */

import type { CartonOrderLink } from '@/lib/orders/po-order-link';
import { readReturnReason } from '@/lib/inbound/return-reason-codes';

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
  /** Zoho PO header notes — the sync-note listing-link tier. */
  zoho_notes?: string | null;
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
  /** Zoho ITEM title — preferred over item_name for contents display. */
  zoho_item_title?: string | null;
  catalog_product_title?: string | null;
  /** Zoho proxy / catalog thumb — from RECEIVING_LINE_IMAGE_URL_SQL. */
  image_url?: string | null;
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
  /** Required for the avatar. */
  actor_staff_id: number | null;
  actor_name: string | null;
  station: string | null;
  sku: string | null;
  serial_number: string | null;
  bin_name: string | null;
  prev_status: string | null;
  next_status: string | null;
  notes: string | null;
}

/**
 * Workflow-transition notes written by `receiveLineUnits`.
 * Legacy: `Stage Matched → Unboxed`. Current: `Matched → Unboxed`.
 * Both already ARE the human trail — never also print `NOTE` + machine codes.
 */
const WORKFLOW_STAGE_NOTE_RE = /^Stage\s+/i;

/** Human trail note (`Matched → Unboxed`), not a machine trail (`MATCHED → UNBOXED`). */
function isHumanTrailNote(notes: string): boolean {
  const body = notes.replace(WORKFLOW_STAGE_NOTE_RE, '').trim();
  if (!/.+\s*→\s+.+/.test(body)) return false;
  // Machine trails are ALL_CAPS_SNAKE tokens only.
  return !/^[A-Z][A-Z0-9_]*(\s*→\s*[A-Z][A-Z0-9_]*)+$/.test(body);
}

/**
 * Operator-facing ACTIVITY title. Prefer notes; fall back to event type.
 * Strips the historical `Stage ` prefix so the row header matches the
 * human trail language (same size band as the meta line).
 */
export function cartonEventTitle(
  event: Pick<CartonInspectorEvent, 'event_type' | 'notes'>,
): string {
  const notes = present(event.notes);
  if (notes) return notes.replace(WORKFLOW_STAGE_NOTE_RE, '');
  return present(event.event_type) ?? 'Event';
}

/** What an ACTIVITY row DID — the fact that separates it from the row above. */
export function cartonEventSignature(
  event: Pick<CartonInspectorEvent, 'event_type' | 'prev_status' | 'next_status' | 'notes'>,
): { kind: string | null; trail: string | null } {
  const type = present(event.event_type);
  const prev = present(event.prev_status);
  const next = present(event.next_status);
  const notes = present(event.notes);
  const titledByNotes = notes != null;

  // Title already carries the human trail — suppress machine kind + trail.
  if (notes && isHumanTrailNote(notes)) {
    return { kind: null, trail: null };
  }

  const trail = next ? (prev && prev !== next ? `${prev} → ${next}` : `→ ${next}`) : null;
  const kind = !titledByNotes || (next != null && type === next) ? null : type;

  return { kind, trail };
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
  /** Outbound orders this carton's PO was bought for (`receiving_order_link`). */
  order_links?: CartonOrderLink[];
}

/** A displayable fact, with the presentation kind it must be resolved through. */
type CartonFactKind =
  | 'text'
  | 'condition'
  | 'platform'
  | 'receivingType'
  | 'carrier'
  | 'qaStatus'
  | 'id'
  | 'externalId'
  | 'instant'
  | 'source';

interface CartonFact {
  key: string;
  label: string;
  /** The RAW stored value — the view resolves it per `kind`. */
  value: string;
  kind: CartonFactKind;
}

/** Carton QA status presentation — NOT a receiving workflow stage. */
interface QaStatusMeta {
  /** Canonical uppercased token, or the raw trimmed value when unknown. */
  status: string;
  label: string;
  /** Tailwind badge classes (bg + text) for the status chip face. */
  badge: string;
  /** Tailwind `bg-*` class for the leading status dot. */
  dot: string;
}

const QA_STATUS_META: Record<string, QaStatusMeta> = {
  PENDING: {
    status: 'PENDING',
    label: 'Pending',
    badge: 'bg-amber-50 text-amber-700',
    dot: 'bg-amber-400',
  },
  PASSED: {
    status: 'PASSED',
    label: 'Passed',
    badge: 'bg-teal-50 text-teal-700',
    dot: 'bg-teal-500',
  },
  FAILED: {
    status: 'FAILED',
    label: 'Failed',
    badge: 'bg-rose-50 text-rose-700',
    dot: 'bg-rose-500',
  },
};

const UNKNOWN_QA_STATUS: QaStatusMeta = {
  status: 'UNKNOWN',
  label: 'Unknown',
  badge: 'bg-surface-sunken text-text-muted',
  dot: 'bg-border-emphasis',
};

/** Resolve carton `qa_status` for status-chip paint. */
export function qaStatusMeta(raw: string | null | undefined): QaStatusMeta {
  const key = String(raw ?? '').trim().toUpperCase();
  if (!key) return UNKNOWN_QA_STATUS;
  const hit = QA_STATUS_META[key];
  if (hit) return hit;
  // Unknown but present token — show the raw face, quiet chip (never invent a stage).
  return { ...UNKNOWN_QA_STATUS, status: key, label: key };
}

export function qaStatusLabel(raw: string | null | undefined): string {
  return qaStatusMeta(raw).label;
}

export function qaStatusToneClass(raw: string | null | undefined): string {
  return qaStatusMeta(raw).badge;
}

/**
 * Carton intake `source` token → operator label.
 * DB check: zoho_po | unmatched | local_pickup | sourcing_import | ebay.
 * Capability nouns — "PO match", not a vendor product sentence.
 */
const RECEIVING_SOURCE_LABELS: Record<string, string> = {
  zoho_po: 'PO',
  unmatched: 'Unmatched',
  local_pickup: 'Local pickup',
  sourcing_import: 'Sourcing import',
  ebay: 'eBay',
};

export function receivingSourceLabel(raw: string | null | undefined): string {
  const key = String(raw ?? '').trim().toLowerCase();
  if (!key) return '';
  return RECEIVING_SOURCE_LABELS[key] ?? String(raw ?? '').trim();
}

/** Non-empty string, or null. Blank and whitespace count as absent. */
function present(value: string | null | undefined): string | null {
  const v = typeof value === 'string' ? value.trim() : '';
  return v.length > 0 ? v : null;
}

/** The at-a-glance fact set. */
export function cartonFacts(receiving: CartonInspectorReceiving): CartonFact[] {
  const out: CartonFact[] = [];
  const add = (key: string, label: string, value: string | null, kind: CartonFactKind = 'text') => {
    if (value) out.push({ key, label, value, kind });
  };

  // Platform + QA lead — state telemetry first, then logistics / disposition.
  add('platform', 'Platform', present(receiving.source_platform), 'platform');
  add('qaStatus', 'QA status', present(receiving.qa_status), 'qaStatus');
  add('carrier', 'Carrier', present(receiving.carrier), 'carrier');
  add('intakeType', 'Intake type', present(receiving.intake_type), 'receivingType');
  add('disposition', 'Disposition', present(receiving.disposition_code));
  add('condition', 'Condition', present(receiving.condition_grade), 'condition');
  add('staging', 'Staging location', present(receiving.staging_location_label));
  add('lane', 'Priority lane', present(receiving.priority_lane));
  add('targetChannel', 'Target channel', present(receiving.target_channel));
  add('returnPlatform', 'Return platform', present(receiving.return_platform), 'platform');
  add('returnReason', 'Return reason', readReturnReason(receiving.return_reason)?.label ?? null);

  return out;
}

/** Exception flags — the states a reader must not have to infer from a fact grid. */
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

/** A RETURN has no PO to find, so "unpaired" is not a finding about it. */
function isReturnCarton(receiving: CartonInspectorReceiving): boolean {
  if (receiving.is_return) return true;
  return present(receiving.intake_type)?.toUpperCase() === 'RETURN';
}

/** "This carton arrived without a PO" — grounded in a RECORDED fact. */
function isCartonUnmatched(receiving: CartonInspectorReceiving): boolean {
  if (present(receiving.pairing_state)?.toUpperCase() === 'UNFOUND') return true;
  return present(receiving.source)?.toLowerCase() === 'unmatched';
}

/** The whole "No matched PO" question, asked once. */
function cartonLacksMatchedPo(
  receiving: CartonInspectorReceiving,
  lines?: ReadonlyArray<Pick<CartonInspectorLine, 'zoho_purchaseorder_number'>> | null,
): boolean {
  return (
    isCartonUnmatched(receiving) &&
    !cartonHasLinkedPo(receiving, lines) &&
    !isReturnCarton(receiving)
  );
}

export function cartonFlags(
  receiving: CartonInspectorReceiving,
  lines?: ReadonlyArray<Pick<CartonInspectorLine, 'zoho_purchaseorder_number'>> | null,
): CartonFlag[] {
  const flags: CartonFlag[] = [];

  if (receiving.is_return) flags.push({ key: 'return', label: 'Return', tone: 'warning' });
  if (receiving.needs_test) flags.push({ key: 'needsTest', label: 'Needs test', tone: 'info' });

  // Arrived without a matching PO. Suppressed when a PO is already linked
  // (carton or line) — the recorded pairing answer can lag behind the link —
  // and when the carton is a RETURN, which has no PO to find.
  if (cartonLacksMatchedPo(receiving, lines)) {
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

/** Header identity for the carton read chrome — raw parts only. */
interface CartonHeaderIdentity {
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
  const add = (
    key: string,
    label: string,
    value: string | null,
    kind: CartonFactKind = 'text',
  ) => {
    if (value) out.push({ key, label, value, kind });
  };
  // NO 'Carton' and NO 'Shipment' row.
  add('source', 'Source', present(receiving.source), 'source');
  // Omitted entirely when nobody recorded a pairing answer — `add` skips a null.
  // That honest absence is the point: this row used to print "UNFOUND" for every
  // carton with no receiving_triage row, which is a fact the footer invented.
  add('pairing', 'Pairing state', present(receiving.pairing_state));
  // Capability nouns for the row labels; values stay the provider ids (copy instruments).
  add('poId', 'PO id', present(receiving.zoho_purchaseorder_id), 'externalId');
  add('receiveId', 'Receive id', present(receiving.zoho_purchase_receive_id), 'externalId');
  add('created', 'Created', present(receiving.created_at), 'instant');
  add('updated', 'Updated', present(receiving.updated_at), 'instant');
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

/** The carton's provenance, in lifecycle order. */
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

/** Lifecycle states a carton can be in, least → most advanced. */
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
  return `${unitPart} · ${complete}/${lines} complete`;
}

/** Exception codes that outrank lifecycle "done" on the read surface. */
type CartonExceptionKey =
  | 'unfound'
  | 'no_lines'
  | 'qa_pending';

interface CartonException {
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
  if (cartonLacksMatchedPo(receiving, lines)) {
    out.push({
      key: 'unfound',
      label: 'No matched PO',
      ctaHint: 'Record or match contents in Unbox',
      tone: 'warning',
    });
  }

  // NO 'triage_incomplete' FINDING.

  const opened = present(receiving.unbox_opened_at) || present(receiving.unboxed_at);
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

/** Operator-facing disposition — the answer the header leads with. */
type CartonDispositionState = 'complete' | 'unmatched' | 'needs_action' | 'in_progress';

interface CartonDisposition {
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
