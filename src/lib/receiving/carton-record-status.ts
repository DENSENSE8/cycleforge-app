/** The carton record's AT-A-GLANCE status — the pipeline a carton walks from the carrier to the shelf, with who / when per step, and the… */

import type { ReceivingLineRow } from './receiving-line-row';
import { isHistoryUnfoundRow } from './history-triage-row';
import { receivingRecordSerials } from './record-identity';
import type { ReceivingStatusAlert, ReceivingStatusStep, ReceivingStepState } from './receiving-status-strip';

/** The carton payload fields the record reads (`GET /api/receiving/:id` → `receiving`). */
export type CartonRecordCarton = {
  id: number;
  zoho_purchaseorder_number?: string | null;
  tracking?: string | null;
  carrier?: string | null;
  source?: string | null;
  source_platform?: string | null;
  pairing_state?: string | null;
  staging_location_label?: string | null;
  triage_completed_at?: string | null;
  tracking_scanned_at?: string | null;
  tracking_scanned_by_name?: string | null;
  unbox_opened_at?: string | null;
  unbox_opened_by_name?: string | null;
  unboxed_at?: string | null;
  unboxed_by_name?: string | null;
  received_at?: string | null;
  received_by_name?: string | null;
  support_notes?: string | null;
  zoho_notes?: string | null;
  listing_url?: string | null;
  is_return?: boolean | null;
  return_reason?: string | null;
  /** The carton row's creation — its import time when no PO date is known. */
  created_at?: string | null;
};

export interface CartonStep extends ReceivingStatusStep {
  key:
    | 'delivered'
    | 'scanned'
    | 'staged'
    | 'unboxed'
    | 'contents'
    | 'graded'
    | 'tested'
    | 'labels'
    | 'received'
    | 'putaway';
}

const text = (value: string | null | undefined): string | null => {
  const trimmed = (value ?? '').trim();
  return trimmed || null;
};

/** Latest non-empty stamp across the lines (ISO / pg strings compare as dates). */
function latest(values: ReadonlyArray<string | null | undefined>): string | null {
  let best: { raw: string; ms: number } | null = null;
  for (const raw of values) {
    const value = text(raw);
    if (!value) continue;
    const ms = Date.parse(value.replace(' ', 'T'));
    if (!best || (Number.isFinite(ms) && ms > best.ms)) best = { raw: value, ms: Number.isFinite(ms) ? ms : -Infinity };
  }
  return best?.raw ?? null;
}

/** A per-line step folded to the carton: all lines → done, some → partial `k/N`. */
function countStep(
  key: CartonStep['key'],
  label: string,
  lines: readonly ReceivingLineRow[],
  hit: (line: ReceivingLineRow) => string | null | undefined,
  pastIt: boolean,
  who: (line: ReceivingLineRow) => string | null | undefined = () => null,
): CartonStep {
  const stamped = lines.filter((line) => text(hit(line)));
  const at = latest(stamped.map(hit));
  const names = [...new Set(stamped.map((line) => text(who(line))).filter((name): name is string => name != null))];
  const n = lines.length;
  const state: ReceivingStepState =
    stamped.length === 0 ? (pastIt ? 'unrecorded' : 'todo') : stamped.length >= n ? 'done' : 'partial';
  return {
    key,
    label,
    state,
    who: names.length ? names.join(', ') : null,
    at,
    detail: n > 1 || state === 'partial' ? `${stamped.length}/${n}` : null,
  };
}

export function deriveCartonSteps(
  carton: CartonRecordCarton | null,
  lines: readonly ReceivingLineRow[],
): CartonStep[] {
  // Negative ids are carton placeholders (no receiving_line) — never item work.
  const items = lines.filter((line) => line.id > 0);
  const first = lines[0] ?? null;
  const steps: CartonStep[] = [];

  const receivedAt = text(carton?.received_at) ?? latest(items.map((line) => line.received_done_at));
  const received = receivedAt != null;
  const unboxedAt = text(carton?.unboxed_at) ?? text(first?.unboxed_at);
  const unboxed = unboxedAt != null || received;

  const deliveredAt = latest(lines.map((line) => line.delivered_at));
  if (deliveredAt || lines.some((line) => line.is_delivered)) {
    steps.push({ key: 'delivered', label: 'Delivered', state: 'done', who: null, at: deliveredAt, detail: null });
  }

  const scannedAt = text(carton?.tracking_scanned_at) ?? text(first?.scanned_at);
  const unboxOnly = Boolean(first?.unbox_only_intake);
  steps.push({
    key: 'scanned',
    label: 'Door scan',
    state: scannedAt ? 'done' : unboxed ? 'unrecorded' : 'todo',
    who: text(carton?.tracking_scanned_by_name) ?? text(first?.scanned_by_name),
    at: scannedAt,
    detail: !scannedAt && unboxOnly ? 'Unbox-only intake' : null,
  });

  const stagedLabel = text(carton?.staging_location_label) ?? text(first?.staging_location_label);
  const triagedAt = text(carton?.triage_completed_at) ?? text(first?.triage_completed_at);
  if (stagedLabel || triagedAt) {
    steps.push({ key: 'staged', label: 'Staged for unbox', state: 'done', who: null, at: triagedAt, detail: stagedLabel });
  }

  steps.push({
    key: 'unboxed',
    label: 'Unboxed',
    state: unboxedAt ? 'done' : received ? 'unrecorded' : 'todo',
    who: text(carton?.unboxed_by_name) ?? text(first?.unboxed_by_name),
    at: unboxedAt,
    detail: null,
  });

  if (items.length > 0) {
    const contentsAt = latest(items.map((line) => line.contents_confirmed_at));
    steps.push({
      key: 'contents',
      label: 'Contents confirmed',
      state: contentsAt ? 'done' : received ? 'unrecorded' : 'todo',
      who: null,
      at: contentsAt,
      detail: null,
    });
    steps.push(countStep('graded', 'Condition graded', items, (line) => line.condition_graded_at, received));

    const testLines = items.filter((line) => line.needs_test || text(line.tested_at) || (line.tested_count ?? 0) > 0);
    if (testLines.length > 0) {
      const tested = testLines.filter((line) => text(line.tested_at) || (line.tested_count ?? 0) > 0);
      steps.push({
        key: 'tested',
        label: 'Tested',
        state: tested.length === 0 ? 'todo' : tested.length >= testLines.length ? 'done' : 'partial',
        who: null,
        at: latest(tested.map((line) => line.tested_at)),
        detail: `${tested.length}/${testLines.length}`,
      });
    }

    steps.push(countStep('labels', 'Labels printed', items, (line) => line.label_printed_at, false));
  }

  const receivedStep: CartonStep =
    items.length > 1
      ? countStep('received', 'Received', items, (line) => line.received_done_at, false)
      : { key: 'received', label: 'Received', state: received ? 'done' : 'todo', who: null, at: receivedAt, detail: null };
  if (received) receivedStep.who = text(carton?.received_by_name) ?? receivedStep.who;
  if (received && receivedStep.state === 'todo') {
    receivedStep.state = 'done';
    receivedStep.at = receivedAt;
  }
  steps.push(receivedStep);

  if (items.some((line) => text(line.staged_at))) {
    const putaway = countStep('putaway', 'Put away', items, (line) => line.staged_at, false, (line) => line.staged_by_name);
    const bins = [...new Set(items.map((line) => text(line.staged_location_code) ?? text(line.staged_location_name)).filter(Boolean))];
    putaway.detail = [bins.join(', '), putaway.detail].filter(Boolean).join(' · ') || null;
    steps.push(putaway);
  }

  return steps;
}

export function deriveCartonAlerts(
  carton: CartonRecordCarton | null,
  lines: readonly ReceivingLineRow[],
  poNumber: string | null,
): ReceivingStatusAlert[] {
  const alerts: ReceivingStatusAlert[] = [];
  const source = (carton?.source || '').trim().toLowerCase();
  const pairing = (carton?.pairing_state || '').trim().toUpperCase();
  const unfound = lines.length > 0 ? lines.some(isHistoryUnfoundRow) : source === 'unmatched' || pairing === 'UNFOUND' || !poNumber;
  if (unfound) alerts.push({ key: 'unfound', tone: 'danger', label: 'Unfound — no purchase order paired' });
  if (lines.some((line) => line.wrong_destination)) {
    alerts.push({ key: 'wrong-destination', tone: 'danger', label: 'Delivered to the wrong destination' });
  }
  const failed = lines.filter((line) => ['FAILED', 'RTV', 'SCRAP'].includes(String(line.workflow_status || '').trim().toUpperCase()));
  if (failed.length > 0) {
    alerts.push({ key: 'exception', tone: 'danger', label: `${failed.length} ${failed.length === 1 ? 'item' : 'items'} failed / RTV / scrap` });
  }
  if (lines.some((line) => line.removed_written_off)) alerts.push({ key: 'written-off', tone: 'danger', label: 'Written off' });
  else if (lines.some((line) => line.removed_aged_out)) alerts.push({ key: 'aged-out', tone: 'warning', label: 'Aged out of the inbound queue' });
  const tickets = [...new Set(lines.map((line) => text(line.zendesk_ticket)).filter(Boolean))];
  if (tickets.length > 0) alerts.push({ key: 'claim', tone: 'warning', label: `Claim ticket ${tickets.join(', ')}` });
  const claimBy = lines.map((line) => text(line.claim_by_date)).find(Boolean);
  if (claimBy) alerts.push({ key: 'claim-by', tone: 'warning', label: `File an item-not-received claim by ${claimBy}` });
  const overSerialed = lines.filter((line) => {
    const count = receivingRecordSerials(line).length;
    return line.quantity_expected != null && count > line.quantity_expected;
  });
  if (overSerialed.length > 0) {
    alerts.push({ key: 'serials', tone: 'warning', label: `${overSerialed.length} ${overSerialed.length === 1 ? 'item has' : 'items have'} more serials than expected units` });
  }
  return alerts;
}
