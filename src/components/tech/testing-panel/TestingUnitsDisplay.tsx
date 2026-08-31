'use client';

/**
 * Testing Units display — the per-unit **verdict** surface on the right-edge
 * push column ({@link StationDisplaysPushStack}), sibling of Unbox's
 * {@link UnitsExplosionDisplay}.
 *
 * Testing's centre keeps PO lines + Pass · Print (station-centre = ops-flow
 * only); the per-unit list — serial · condition · pass/test-again/fail — is an
 * **Action Display** here (`source-of-truth.md` → Station Action vs Context
 * planes). It composes {@link TestingLineSlot} (→ `ActiveLineTestingSerial` →
 * `UnitSlotList`), the SAME waist Unbox uses, so this is not a second units
 * renderer — only the verdict semantics differ from Unbox's grade-only body.
 *
 * Flush plane: fills the column, `px-0`, hairline rows, no glass island — the
 * Displays column IS the card (units-explosion flush grammar).
 */

import type { ActiveRowSerial } from '@/components/receiving/workspace/PoLinesAccordion';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';
import { receivingWorkspaceLineTitle } from '@/lib/receiving/po-group-title';
import type { UnitSlotSerial } from '@/components/tech/TestingUnitSlots';
import type { TestingController } from './testing-panel-types';
import { TestingLineSlot } from './TestingLineSlot';

/** Narrow accordion serials to TestingLineSlot's required-id shape. */
function toUnitSlotSerials(serials: readonly ActiveRowSerial[]): UnitSlotSerial[] {
  return serials
    .filter((s): s is ActiveRowSerial & { id: number } => s.id != null)
    .map((s) => ({
      id: s.id,
      serial_number: s.serial_number,
      condition_grade: s.condition_grade,
    }));
}

export function TestingUnitsDisplay({
  row,
  c,
}: {
  /** The active testing line (re-seeded by the centre accordion on line pick). */
  row: ReceivingLineRow;
  c: TestingController;
}) {
  const serials = (row.serials ?? []) as ActiveRowSerial[];
  const expected = row.quantity_expected ?? null;

  if (row.id == null) {
    return (
      <p className="border-y border-dashed border-border-hairline bg-surface-canvas px-3 py-5 text-center text-role-caption text-text-soft">
        Open a line to test its units.
      </p>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-0 px-0" data-testid="testing-units-display">
      <header
        className="flex min-w-0 shrink-0 items-baseline justify-between gap-2 border-b border-border-hairline px-3 py-2.5"
        data-testing-units-active
        data-line-id={row.id}
      >
        <div className="min-w-0">
          <p className="truncate text-role-caption font-semibold text-text-default">
            {receivingWorkspaceLineTitle(row)}
          </p>
          <p className="text-role-eyebrow uppercase tracking-widest text-text-soft">
            Active line · unit verdict
          </p>
        </div>
        <span className="shrink-0 font-mono text-role-caption tabular-nums text-text-muted">
          {serials.length}/{expected ?? '?'}
        </span>
      </header>

      <div className="min-w-0 flex-1">
        <TestingLineSlot
          c={c}
          lineId={row.id}
          serials={toUnitSlotSerials(serials)}
          expected={expected}
          disabled={c.saving}
          selectedIndex={c.activeSlotByLine[row.id] ?? c.activeSlot}
          // Opening the display must not steal the scan bar — the wedge owns
          // focus via the scan-session bridge, not the display's serial adder.
          autoFocus={false}
          // One flush editable row per serial — exactly like Unbox's Units
          // display. Never the chip + empty "Serial" adder combo (single-qty
          // fallback), which duplicates a scanned serial.
          forceUnitRows
          flush
          editingSerial={c.headerSerialEdit}
          onEditingSerialChange={c.setHeaderSerialEdit}
        />
      </div>
    </div>
  );
}
