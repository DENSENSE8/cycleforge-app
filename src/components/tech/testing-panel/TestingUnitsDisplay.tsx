'use client';

/** Testing Units display — the per-unit **verdict** surface on the right-edge push column ({@link StationDisplaysPushStack}), sibling of… */

import type { ActiveRowSerial } from '@/components/receiving/workspace/PoLinesAccordion';
import {
  TestingStatusPills,
  unitStatusToVerdict,
} from '@/components/receiving/workspace/TestingStatusPills';
import { QcUnitBench } from '@/components/qc/QcUnitBench';
import type { ReceivingLineRow } from '@/lib/receiving/receiving-line-row';
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

  const active = c.activeSerial?.id != null && c.activeSerial.id > 0 ? c.activeSerial : null;

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
          <p className="text-role-eyebrow text-text-soft">
            Active line · unit verdict
          </p>
        </div>
        <span className="shrink-0 font-mono text-role-caption tabular-nums text-text-muted">
          {serials.length}/{expected ?? '?'}
        </span>
      </header>

      <div className="min-w-0 shrink-0">
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

      {active ? (
        // The selected unit's bench — session, readings, next steps. Keyed so a
        // unit switch drops the last unit's triage list and form drafts.
        <div className="min-h-0 flex-1 overflow-y-auto border-t border-mode-rule">
          <p className="px-3 pt-2.5 font-mono text-role-caption font-semibold text-mode-ink">
            SN {active.serial_number}
          </p>
          <QcUnitBench
            key={active.id}
            unitId={active.id}
            unitStatus={active.current_status}
            verdictActions={
              <TestingStatusPills
                value={unitStatusToVerdict(active.current_status)}
                onChange={(next) => c.requestSlotVerdict(row.id, active, next)}
                disabled={c.saving}
              />
            }
          />
        </div>
      ) : null}
    </div>
  );
}
