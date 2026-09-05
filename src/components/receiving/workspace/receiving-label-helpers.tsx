'use client';

import { dispatchLineUpdated } from '@/components/station/receiving-lines-table-helpers';
import { persistGateWrite, persistGateWriteBatch } from './receiving-gate-write';

export { printReceivingLabel, printReceivingLabelJob } from '@/lib/print/printReceivingDispatch';

// Re-exported so the unbox workspace (LineEditPanel / LabelEditPopover /
// useUnboxLineController) and the raw-command builder keep their existing import
// path. The canonical definition lives in `@/lib/print/printReceivingLabel`.
export type { ReceivingLabelPayload } from '@/lib/print/printReceivingLabel';

/**
 * Record that a receiving label was printed for a line — the single choke point
 * shared by the default unbox print and the custom label-editor print, so the
 * two can never diverge.
 *
 * Three effects, in order of latency:
 *   1. localStorage marker + `receiving-label-printed` DOM event → the Print
 *      step / row chips flip *instantly* on this device (optimistic).
 *   2. POST /api/receiving/lines/[id]/label-printed → the DURABLE stamp
 *      (`receiving_line_testing.label_printed_at`) that survives refresh / other
 *      devices and is auditable. The server COALESCE keeps the first print, so a
 *      reprint is a no-op on the recorded value — but a write that never lands
 *      is not a no-op, so the result is inspected and reverted on failure.
 *
 * `previousPrintedAt` is required (see {@link PreviousLineCondition}) so the
 * commit `stage` pointer cannot stay armed on a print the server never recorded.
 * A reprint passes the existing stamp and correctly reverts to it.
 */
export function markReceivingLabelPrinted(
  lineId: number,
  previousPrintedAt: string | null,
): void {
  if (typeof window === 'undefined' || !(lineId > 0)) return;
  persistGateWrite({
    fact: 'Print record',
    // Optimistic patch — stamps label_printed_at without waiting for the
    // POST / feed invalidate round-trip.
    apply: () => announceLabelPrinted(lineId, new Date().toISOString()),
    // A prior print restores its stamp; a first print that failed clears the
    // marker, or the local chip would outlive the stamp it stands for.
    revert: () => announceLabelPrinted(lineId, previousPrintedAt),
    url: `/api/receiving/lines/${lineId}/label-printed`,
    init: { method: 'POST' },
  });
}

/**
 * Publish one label-printed state — local marker, DOM event, row patch.
 *
 * Apply and revert are the SAME broadcast with a different stamp, so they share
 * one body: a second copy would be a second place for the three effects to fall
 * out of step, and it would add a raw `receiving-` CustomEvent to a bus the
 * `receiving-events.guard` ratchet is actively shrinking.
 *
 * `printedAt === null` clears. Only the marker's PRESENCE is read anywhere
 * (the durable column superseded its value — see
 * `2026-07-12_receiving_line_label_printed_at.sql`), so the stamp is stored
 * as-is rather than re-derived.
 */
function announceLabelPrinted(lineId: number, printedAt: string | null): void {
  try {
    const localKey = `receiving-label-printed:${lineId}`;
    if (printedAt) window.localStorage.setItem(localKey, printedAt);
    else window.localStorage.removeItem(localKey);
  } catch {
    /* private-mode / quota — non-fatal */
  }
  window.dispatchEvent(
    new CustomEvent('receiving-label-printed', { detail: { line_id: lineId } }),
  );
  dispatchLineUpdated({ id: lineId, label_printed_at: printedAt });
}

/**
 * Record the no-serial waiver for a receiving line — the single choke point for
 * the green-check "no serial" toggle (NoSerialControl), so every caller persists
 * the SAME durable fact and the stepper can never disagree with the control.
 *
 * Two effects, in order of latency (mirrors {@link markReceivingLabelPrinted}):
 *   1. `dispatchLineUpdated` → the shared `receiving-line-updated` bus patches
 *      `selectedLine.serial_absent`, so the Unbox stepper's Serial step (which
 *      derives from `row.serial_absent`) flips the instant the operator toggles —
 *      the SAME optimistic path a scanned serial already rides.
 *   2. POST /api/receiving/lines/[id]/serial-absent → the DURABLE stamp
 *      (`receiving_line_testing.serial_absent`) that survives refresh / another
 *      device. A toggle writes the exact value (set or clear), and the result is
 *      inspected so a rejected waiver cannot leave the Serial step settled.
 *
 * A stub/unfound line (id ≤ 0) is skipped — there's no persisted line to stamp
 * yet; the local controller state still reflects the waiver until the line lands.
 */
export function markReceivingSerialAbsent(
  lineId: number,
  { absent, reason }: { absent: boolean; reason: string | null },
  previous: { serial_absent: boolean; serial_absent_reason: string | null },
): void {
  if (typeof window === 'undefined' || !(lineId > 0)) return;
  persistGateWrite({
    fact: 'No-serial waiver',
    apply: () =>
      dispatchLineUpdated({
        id: lineId,
        serial_absent: absent,
        serial_absent_reason: reason,
      }),
    revert: () =>
      dispatchLineUpdated({
        id: lineId,
        serial_absent: previous.serial_absent,
        serial_absent_reason: previous.serial_absent_reason,
      }),
    url: `/api/receiving/lines/${lineId}/serial-absent`,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ absent, reason }),
    },
  });
}

type LineUnitWire = {
  id: number;
  ordinal: number;
  serial_unit_id: number | null;
  serial: string | null;
  serial_absent: boolean;
  serial_absent_reason: string | null;
  condition_grade: string | null;
};

/**
 * Record a per-unit no-serial waiver — the choke point for the multi-qty row
 * green-check (UnitSlotList), so every caller persists the SAME durable fact
 * and the stepper can never disagree with the control.
 *
 * Two effects, same contract as {@link markReceivingSerialAbsent}:
 *   1. `dispatchLineUpdated` patches `units[]` on the shared bus so the Unbox
 *      stepper (which derives from `row.units`) flips on the same frame.
 *   2. POST /api/receiving/lines/[id]/units/[unitId]/serial-absent → the
 *      DURABLE stamp on `receiving_line_unit`. Exact-value toggle (set or
 *      clear); the result is inspected and the slot reverted on failure. Never
 *      touches the line-level waiver.
 *
 * `currentUnits` is both the optimistic base and the rollback snapshot — no
 * extra argument is needed to revert.
 */
export function markReceivingUnitSerialAbsent(
  lineId: number,
  unitId: number,
  { absent, reason }: { absent: boolean; reason: string | null },
  currentUnits: ReadonlyArray<LineUnitWire> | null | undefined,
): void {
  if (typeof window === 'undefined' || !(lineId > 0) || !(unitId > 0)) return;
  persistGateWrite({
    fact: 'Unit no-serial waiver',
    apply: () => {
      if (!currentUnits) return;
      dispatchLineUpdated({
        id: lineId,
        units: currentUnits.map((u) =>
          u.id === unitId
            ? {
                ...u,
                serial_absent: absent,
                serial_absent_reason: reason,
              }
            : u,
        ),
      });
    },
    revert: () => {
      if (!currentUnits) return;
      dispatchLineUpdated({ id: lineId, units: currentUnits.map((u) => ({ ...u })) });
    },
    url: `/api/receiving/lines/${lineId}/units/${unitId}/serial-absent`,
    init: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ absent, reason }),
    },
  });
}

/**
 * Persist a per-unit condition grade on `receiving_line_unit` — Phase 4
 * replacement for the ephemeral `pendingGrade` map. Same two-effect contract
 * as {@link markReceivingUnitSerialAbsent}: optimistic `units[]` bus patch,
 * then durable PATCH. Does NOT write `serial_units` — callers dual-call
 * `setUnitGrade` when a serial is already linked.
 */
export function markReceivingUnitCondition(
  lineId: number,
  unitId: number,
  conditionGrade: string,
  currentUnits: ReadonlyArray<LineUnitWire> | null | undefined,
): void {
  if (typeof window === 'undefined' || !(lineId > 0) || !(unitId > 0)) return;
  const raw = String(conditionGrade || '').trim().toUpperCase();
  // Empty string clears the per-unit grade (nullable column).
  const grade: string | null = raw || null;
  persistGateWrite({
    fact: 'Unit condition grade',
    apply: () => {
      if (!currentUnits) return;
      dispatchLineUpdated({
        id: lineId,
        units: currentUnits.map((u) =>
          u.id === unitId ? { ...u, condition_grade: grade } : u,
        ),
      });
    },
    revert: () => {
      if (!currentUnits) return;
      dispatchLineUpdated({ id: lineId, units: currentUnits.map((u) => ({ ...u })) });
    },
    url: `/api/receiving/lines/${lineId}/units/${unitId}/condition`,
    init: {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ condition_grade: grade }),
    },
  });
}

/**
 * Stamp every materialised unit on a line to one grade — the "All units"
 * master picker. One bus patch (so intermediate frames aren't half-updated),
 * then one durable PATCH per unit.
 *
 * Partial failure reverts **only** the units whose PATCH did not land; the ones
 * that succeeded keep the new grade, because they are durable.
 */
export function markAllReceivingUnitsCondition(
  lineId: number,
  conditionGrade: string,
  currentUnits: ReadonlyArray<LineUnitWire> | null | undefined,
): void {
  if (typeof window === 'undefined' || !(lineId > 0)) return;
  const raw = String(conditionGrade || '').trim().toUpperCase();
  // Empty string clears every unit grade (nullable).
  const grade: string | null = raw || null;
  if (!currentUnits || currentUnits.length === 0) return;
  const snapshot = currentUnits;
  persistGateWriteBatch<LineUnitWire>({
    fact: 'unit grade',
    items: snapshot,
    apply: () =>
      dispatchLineUpdated({
        id: lineId,
        units: snapshot.map((u) => ({ ...u, condition_grade: grade })),
      }),
    revert: (failed) => {
      const failedIds = new Set(failed.map((u) => u.id));
      dispatchLineUpdated({
        id: lineId,
        units: snapshot.map((u) =>
          failedIds.has(u.id) ? { ...u } : { ...u, condition_grade: grade },
        ),
      });
    },
    request: (u) => ({
      url: `/api/receiving/lines/${lineId}/units/${u.id}/condition`,
      init: {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ condition_grade: grade }),
      },
    }),
  });
}

/**
 * Stamp units by ordinal with a primary grade for the first `primaryCount`
 * rows and an optional secondary grade for the remainder — the qty-rollup
 * exception split (e.g. 480 NEW / 20 PARTS) without rendering N unit rows.
 */
export function markReceivingUnitsConditionSplit(
  lineId: number,
  primaryGrade: string,
  primaryCount: number,
  secondaryGrade: string | null,
  currentUnits: ReadonlyArray<LineUnitWire> | null | undefined,
): void {
  if (typeof window === 'undefined' || !(lineId > 0)) return;
  const primary = String(primaryGrade || '').trim().toUpperCase();
  const secondary = secondaryGrade
    ? String(secondaryGrade).trim().toUpperCase()
    : null;
  if (!primary || !currentUnits || currentUnits.length === 0) return;
  const cut = Math.max(0, Math.min(Math.floor(primaryCount), currentUnits.length));
  const snapshot = currentUnits;
  const next = snapshot.map((u, i) => ({
    ...u,
    condition_grade: i < cut ? primary : secondary ?? primary,
  }));
  const byId = new Map(next.map((u) => [u.id, u]));
  persistGateWriteBatch<LineUnitWire>({
    fact: 'unit grade',
    items: next.filter((u) => u.condition_grade),
    apply: () => dispatchLineUpdated({ id: lineId, units: next }),
    revert: (failed) => {
      const failedIds = new Set(failed.map((u) => u.id));
      dispatchLineUpdated({
        id: lineId,
        // Failed units fall back to their pre-split grade; the rest keep the
        // split value they durably received.
        units: snapshot.map((u) =>
          failedIds.has(u.id) ? { ...u } : (byId.get(u.id) ?? { ...u }),
        ),
      });
    },
    request: (u) => ({
      url: `/api/receiving/lines/${lineId}/units/${u.id}/condition`,
      init: {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ condition_grade: u.condition_grade }),
      },
    }),
  });
}

/**
 * Waive serials on every empty (no serial linked) unit — qty-rollup bulk
 * "no serial" path. Leaves units that already have a serial untouched.
 * One bus patch, then one POST per empty unit.
 */
export function markAllEmptyReceivingUnitsSerialAbsent(
  lineId: number,
  reason: string,
  currentUnits: ReadonlyArray<LineUnitWire> | null | undefined,
): void {
  if (typeof window === 'undefined' || !(lineId > 0)) return;
  const code = String(reason || '').trim() || 'BULK';
  if (!currentUnits || currentUnits.length === 0) return;
  const snapshot = currentUnits;
  const targets = snapshot.filter((u) => u.serial_unit_id == null);
  if (targets.length === 0) return;
  const targetIds = new Set(targets.map((u) => u.id));
  const waived = (u: LineUnitWire) => ({
    ...u,
    serial_absent: true,
    serial_absent_reason: code,
  });
  persistGateWriteBatch<LineUnitWire>({
    fact: 'unit no-serial waiver',
    items: targets,
    apply: () =>
      dispatchLineUpdated({
        id: lineId,
        units: snapshot.map((u) => (targetIds.has(u.id) ? waived(u) : u)),
      }),
    revert: (failed) => {
      const failedIds = new Set(failed.map((u) => u.id));
      dispatchLineUpdated({
        id: lineId,
        units: snapshot.map((u) =>
          targetIds.has(u.id) && !failedIds.has(u.id) ? waived(u) : { ...u },
        ),
      });
    },
    request: (u) => ({
      url: `/api/receiving/lines/${lineId}/units/${u.id}/serial-absent`,
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ absent: true, reason: code }),
      },
    }),
  });
}
