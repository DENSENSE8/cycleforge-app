/**
 * Inbound › History — the receiving-history family's card model (layer 2 of
 * the triage face), pure. One card per CARTON (`receiving_id`, the record the
 * plane already opens); its lines are the "+N items" columns.
 *
 *   ┃ ☐  21-15107-47310 · ● eBay · aerodeals   🗨 note              Sep 26
 *   ┃ ◉  [photo] Replacement PCB Board Rear Panel
 *   ┃           ×1 · Used · SKU · 📍 A-14                              → Review
 */

import type { RowGroup } from '@/lib/group-rows';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
import {
  DOCKED_PACKAGE_FACE,
  dockedFlags,
  dockedNextStep,
  dockedReceivedQuantity,
  dockedRecordFace,
  dockedTicketLabels,
  type DockedTicketLabel,
} from '@/lib/receiving/docked-record-state';
import type { RecordCardLine, RecordCardModel } from '@/design-system/components/record-card/record-card-types';
import { INCOMING_UNBOXED_VIEW } from '@/lib/triage/views';
import { recordStateGlyph } from '@/design-system/components/record-card/record-state-glyph';
import type { RecordStateFace } from '@/design-system/tokens/industrial-record';
import { displayReceivingProductTitle } from '@/components/station/receiving-grid/cells';
import { fmtMoney } from '@/components/sidebar/receiving/incoming-details/incoming-details-shared';
import { formatDateTimePST, formatMonthDayTimePST } from '@/utils/date';
import {
  resolveReceivingRowStageStamp,
  type ReceivingActivityAxis,
} from '@/lib/receiving/receiving-stage-stamp';
import { conditionSentenceLabel, resolveConditionGrade } from '@/lib/conditions';
import { workflowStageLabel } from '@/lib/receiving/workflow-stages';

/** Which face needs a person first — a carton wears its most urgent line (`dockedRecordFace`). */
const STATE_URGENCY: Readonly<Record<string, number>> = { EXCEPTION: 6, UNFOUND: 5, CLAIM: 4, SHORT: 3, SCANNED: 2, RECEIVED: 0 };
const urgency = (face: RecordStateFace) => STATE_URGENCY[face.id] ?? 1;

/** An unfound carton leads its band (owner 2026-09-28); the band's own order holds otherwise. */
const unfoundFirst = (groups: RowGroup<ReceivingLineRow>[]) => {
  const unfound = (group: RowGroup<ReceivingLineRow>) => group.rows.some((row) => dockedFlags(row).includes('UNFOUND'));
  return [...groups].sort((a, b) => Number(unfound(b)) - Number(unfound(a)));
};

/** The line's unit cost (Zoho PO rate); null when absent or zero — a free unit is a missing price here. */
function linePrice(row: ReceivingLineRow): string | null {
  const n = Number(row.unit_price);
  return row.unit_price != null && Number.isFinite(n) && n > 0 ? fmtMoney(n, 'USD') : null;
}

/** A carton's activity-day bucket; the view declares their order and labels. */
export type CartonSection = 'today' | 'yesterday' | 'week' | 'earlier' | 'undated';

export interface CartonCardModel {
  key: string;
  ids: number[];
  /** The line the body opens — the carton's most urgent, else its first. */
  lead: ReceivingLineRow;
  /** Every line, most urgent first (stable). */
  rows: ReceivingLineRow[];
  /** Docked knows only package arrival; Unboxed may describe inspected contents. */
  surface: 'docked' | 'unboxed';
  state: RecordStateFace;
  /** The carton's one unique id, bare — its PO / order #, else `#<carton>` (the page already says History). */
  identity: string;
  /** `source_platform` key (catalog slug) — the card's channel. */
  platform: string | null;
  /** Full package tracking number, shown beside the record identity in the compact card header. */
  tracking: string | null;
  /** Who sold / sent it: the PO vendor, else the storefront account. */
  vendor: string | null;
  /** The carton's latest activity on the chosen axis (bands the list). */
  activity: { label: string; instant: string } | null;
  /** When the carton was first unpacked (first Unbox open, else unbox complete); null = never. */
  unboxedAt: string | null;
  /** Who unboxed it (`unboxed_by_name`); null = not recorded. */
  unboxedBy: string | null;
}

const cartonKeyOf = (row: ReceivingLineRow) => (row.receiving_id != null ? `carton:${row.receiving_id}` : `line:${row.id}`);

/**
 * A carton's unique id with no label word and no "#": the PO / marketplace
 * order #, else the carton number — bare, the same way every platform's order
 * id reads (owner 2026-09-28: an unfound carton wears no hashtag).
 */
export function cartonCardIdentity(row: ReceivingLineRow): string {
  const order = (row.zoho_purchaseorder_number || row.source_order_id || '').trim();
  return order || String(row.receiving_id ?? Math.abs(row.id));
}

/** Lines → cartons, in the order the host's rows arrive (its sort stays the list's order). */
export function groupCartons(rows: readonly ReceivingLineRow[]): RowGroup<ReceivingLineRow>[] {
  const byKey = new Map<string, RowGroup<ReceivingLineRow>>();
  for (const row of rows) {
    const key = cartonKeyOf(row);
    const group = byKey.get(key);
    if (group) group.rows.push(row);
    else byKey.set(key, { key, rows: [row] });
  }
  return [...byKey.values()];
}

export function cartonCardKey(group: RowGroup<ReceivingLineRow>): string {
  return group.key;
}

function latestActivity(rows: readonly ReceivingLineRow[], axis: ReceivingActivityAxis): CartonCardModel['activity'] {
  let best: CartonCardModel['activity'] = null;
  for (const row of rows) {
    const stamp = resolveReceivingRowStageStamp(row, axis);
    if (stamp?.instant && (!best || stamp.instant > best.instant)) best = { label: stamp.label, instant: stamp.instant };
  }
  return best;
}

/** The carton's first unpack across its lines — the earliest open / unbox stamp. */
function firstUnboxed(rows: readonly ReceivingLineRow[]): string | null {
  let first: string | null = null;
  for (const row of rows) {
    const stamp = (row.unbox_opened_at || row.unboxed_at || '').trim();
    if (stamp && (!first || new Date(stamp).getTime() < new Date(first).getTime())) first = stamp;
  }
  return first;
}

/** Who unboxed the carton — the first line that recorded a name. */
function unboxedByName(rows: readonly ReceivingLineRow[]): string | null {
  return rows.map((row) => (row.unboxed_by_name ?? '').trim()).find(Boolean) ?? null;
}

function firstTrackingNumber(rows: readonly ReceivingLineRow[]): string | null {
  return rows.map((row) => (row.tracking_number ?? '').trim()).find(Boolean) ?? null;
}

/** A carton's section by its latest activity, against the viewer's today. */
export function cartonSectionOf(group: RowGroup<ReceivingLineRow>, axis: ReceivingActivityAxis, now = new Date()): CartonSection {
  const activity = latestActivity(group.rows, axis);
  if (!activity) return 'undated';
  const at = new Date(activity.instant);
  if (Number.isNaN(at.getTime())) return 'undated';
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const DAY = 86_400_000;
  if (at.getTime() >= dayStart) return 'today';
  if (at.getTime() >= dayStart - DAY) return 'yesterday';
  if (at.getTime() >= dayStart - 6 * DAY) return 'week';
  return 'earlier';
}

/**
 * Cartons banded by activity day (fixed order), unfound cartons first in each
 * band; or one band in the host's order when the list is sorted by something
 * else (an explicit column sort is the operator's order).
 */
export function cartonBands(
  rows: readonly ReceivingLineRow[],
  axis: ReceivingActivityAxis,
  sectioned: boolean,
): [string, RowGroup<ReceivingLineRow>[]][] {
  const groups = groupCartons(rows);
  if (!sectioned) return groups.length ? [['all', groups]] : [];
  const bySection = new Map<CartonSection, RowGroup<ReceivingLineRow>[]>();
  for (const group of groups) {
    const section = cartonSectionOf(group, axis);
    const list = bySection.get(section);
    if (list) list.push(group);
    else bySection.set(section, [group]);
  }
  return (INCOMING_UNBOXED_VIEW.sections?.order ?? []).flatMap((section) => {
    const list = bySection.get(section as CartonSection);
    return list ? [[section, unfoundFirst(list)] as [string, RowGroup<ReceivingLineRow>[]]] : [];
  });
}

export function cartonCardModel(
  group: RowGroup<ReceivingLineRow>,
  axis: ReceivingActivityAxis,
  surface: CartonCardModel['surface'] = 'unboxed',
): CartonCardModel {
  // A sealed Docked package has no inspected exception priority. Preserve the
  // arrival feed's line order until Unbox establishes what is actually inside.
  const rows = surface === 'docked'
    ? [...group.rows]
    : [...group.rows].sort((a, b) => urgency(dockedRecordFace(b)) - urgency(dockedRecordFace(a)));
  const lead = rows[0]!;
  return {
    key: group.key,
    ids: rows.map((row) => row.id),
    lead,
    rows,
    surface,
    state: surface === 'docked' ? DOCKED_PACKAGE_FACE : dockedRecordFace(lead),
    identity: cartonCardIdentity(lead),
    platform: (lead.source_platform_pill || lead.source_platform || '').trim() || null,
    tracking: firstTrackingNumber(rows),
    vendor: (lead.vendor_name || lead.platform_account_label || '').trim() || null,
    activity: latestActivity(rows, axis),
    unboxedAt: firstUnboxed(rows),
    unboxedBy: unboxedByName(rows),
  };
}

function cartonLine(row: ReceivingLineRow, surface: CartonCardModel['surface']): RecordCardLine {
  const state = surface === 'docked' ? DOCKED_PACKAGE_FACE : dockedRecordFace(row);
  const bin = row.staged_location_code || row.staged_location_name || row.staging_location_label || null;
  const dockedQty = row.quantity_expected ?? row.quantity_received ?? 0;
  return {
    id: row.id,
    title: displayReceivingProductTitle(row),
    photoUrl: row.image_url,
    alert: surface === 'unboxed' && state.id === 'EXCEPTION',
    alertNote: surface === 'unboxed' && state.id === 'EXCEPTION' ? `${state.label} · ${workflowStageLabel(row.workflow_status)}` : null,
    // An unfound carton (negative id) has no line yet: its placeholder's 0 / BRAND_NEW are defaults, not facts.
    facts: {
      qty:
        row.id > 0
          ? surface === 'docked'
            ? { kind: 'qty', value: dockedQty }
            : { kind: 'received', received: dockedReceivedQuantity(row), expected: row.quantity_expected }
          : null,
      condition: row.id > 0 && row.condition_grade ? { kind: 'grade', label: conditionSentenceLabel(row.condition_grade), code: resolveConditionGrade(row.condition_grade) } : null,
      sku: row.sku ? { kind: 'code', text: row.sku, title: 'SKU' } : null,
      // Docked is a sealed package, not an inventoried SKU. Until staff assigns
      // its physical resting place, say "No location" rather than implying a
      // product-bin decision has already been made. Unboxed lines retain the
      // bin-specific fallback because they are inventory.
      bin: { kind: 'place', path: bin, empty: surface === 'docked' ? 'No location' : 'No bin' },
      // No price reads as a struck "$—" (missing, not zero) so a claim's value is never guessed.
      price: row.id > 0 ? { kind: 'money', text: linePrice(row), estimate: false, estimateTitle: '' } : null,
    },
  };
}

const moreExceptions = (count: number) => `${count} more ${count === 1 ? 'exception' : 'exceptions'}`;

const TICKET_FAMILY_ORDER = { investigation: 0, claim: 1 } as const;

/** The carton's filed tickets, one per number, investigations first (a carton can be both). */
function cartonTicketLabels(rows: readonly ReceivingLineRow[]): DockedTicketLabel[] {
  const byTicket = new Map<string, DockedTicketLabel>();
  for (const label of rows.flatMap(dockedTicketLabels)) {
    const held = byTicket.get(label.ticket);
    // A reasoned entry beats the reasonless one for the same number.
    if (!held || (held.family == null && label.family != null)) byTicket.set(label.ticket, label);
  }
  const rank = (l: DockedTicketLabel) => (l.family == null ? 2 : TICKET_FAMILY_ORDER[l.family]);
  return [...byTicket.values()].sort((a, b) => rank(a) - rank(b));
}

export function cartonRecordCard(model: CartonCardModel): RecordCardModel {
  const { state, identity, activity } = model;
  const lines = model.rows.map((row) => cartonLine(row, model.surface));
  const alertCount = lines.filter((line) => line.alert).length;
  // The carton's next step: its most urgent line's, else the first line with one left.
  const next = model.surface === 'docked'
    ? 'Unbox'
    : model.rows.map(dockedNextStep).find((step) => step != null) ?? null;
  const tickets = cartonTicketLabels(model.rows);
  // The corner reads the exact unpack moment, date AND time, and who did it
  // (owner 2026-09-28: "when it was unpacked" and by whom, without opening the
  // carton); else the activity stamp.
  const corner = model.unboxedAt ? { label: 'Unboxed', instant: model.unboxedAt, by: model.unboxedBy } : activity ? { ...activity, by: null } : null;
  const note = (model.lead.notes ?? '').trim();
  return {
    key: model.key,
    leadId: model.lead.id,
    state,
    stateIcon: recordStateGlyph(state),
    stateMeaning: state.label,
    alert:
      alertCount > 0
        ? {
            count: alertCount,
            summary: `${alertCount} of ${lines.length} ${alertCount === 1 ? 'exception' : 'exceptions'}`,
            ariaLabel: `${state.label}, ${alertCount} of ${lines.length} lines in exception`,
          }
        : null,
    aria: {
      card: `${identity}, ${state.label}, ${lines[0]?.title ?? ''}`,
      open: `Open ${identity}`,
      check: `Select ${identity}`,
    },
    // Line 1's channel is painted by the adapter (catalog-aware brand dot); the vendor is the person.
    channel: null,
    person: model.vendor,
    // Each filed ticket on line 1 with what it is for — "Investigating #10066",
    // "Damaged #10066", or "Ticket #…" when it carries no reason.
    chips: tickets.map((t) => ({
      id: `ticket-${t.ticket}`,
      tone: t.family === 'claim' ? 'warning' : 'info',
      short: t.ticket,
      long: `${t.label} ${t.ticket}`,
      tooltip: t.family == null ? `Ticket ${t.ticket} — no reason recorded` : `${t.label} — ticket ${t.ticket}`,
      testId: 'receipt-card-ticket',
    })),
    notes: { fixed: note ? { label: 'Receiving note', text: note } : null, own: null },
    // When (and by whom) the carton was unpacked — danger while one of its lines is in exception.
    status: corner
      ? {
          kind: 'date',
          face: corner.by ? `${formatMonthDayTimePST(corner.instant)} · ${corner.by}` : formatMonthDayTimePST(corner.instant),
          tip: `${corner.label} · ${formatDateTimePST(corner.instant)} PT${corner.by ? ` · by ${corner.by}` : ''}`,
          alert: alertCount > 0,
        }
      : { kind: 'date', face: 'No date', tip: null, alert: alertCount > 0 },
    next: next ? { label: next, tone: state.tone, tip: `Next: ${next.toLowerCase()}`, blocked: false } : null,
    lines,
    hiddenAlertLabel: moreExceptions,
  };
}
