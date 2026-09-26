import { requestConfirm } from '@/design-system/components/confirm';
import { ActiveLineTestingSerial, type UnitSlotSerial } from './ActiveLineTestingSerial';
import type { TestingController } from './testing-panel-types';

/** Shared confirm before removing a serial. */
async function confirmDeleteSerial(serialNumber: string): Promise<boolean> {
  return requestConfirm({
    description: `Remove serial ${serialNumber}?`,
    tone: 'danger',
    confirmLabel: 'Remove',
  });
}

/** The verdict/serial slot for one testing line. */
export function TestingLineSlot({
  c,
  lineId,
  serials,
  expected,
  disabled,
  selectedIndex,
  autoFocus,
  showSavedChips,
  editingSerial,
  onEditingSerialChange,
  forceUnitRows,
  flush,
}: {
  c: TestingController;
  lineId: number;
  serials: UnitSlotSerial[];
  expected: number | null;
  disabled: boolean;
  selectedIndex: number;
  autoFocus?: boolean;
  showSavedChips?: boolean;
  editingSerial?: UnitSlotSerial | null;
  onEditingSerialChange?: (s: UnitSlotSerial | null) => void;
  /** Flush per-unit rows even for qty 1 — Unbox Units display parity. */
  forceUnitRows?: boolean;
  flush?: boolean;
}) {
  return (
    <ActiveLineTestingSerial
      lineId={lineId}
      saved={serials}
      expected={expected}
      verdict={c.deriveLineVerdict(serials)}
      isSubmitting={c.serialSubmitting}
      disabled={disabled}
      autoFocus={autoFocus}
      showSavedChips={showSavedChips}
      editingSerial={editingSerial}
      onEditingSerialChange={onEditingSerialChange}
      forceUnitRows={forceUnitRows}
      flush={flush}
      selectedIndex={selectedIndex}
      onSelectIndex={(i) => c.setActiveSlotByLine((m) => ({ ...m, [lineId]: i }))}
      onSetVerdict={(next) => c.requestLineVerdict(lineId, serials, next)}
      onSetUnitVerdict={(serial, next) => c.requestSlotVerdict(lineId, serial, next)}
      onSetUnitCondition={(serial, next) => void c.handleSlotCondition(lineId, serial, next)}
      onAddSerial={(sn) => c.enqueueSerial(lineId, sn)}
      onDeleteSerial={async (s) => {
        if (s.id == null) return;
        if (!(await confirmDeleteSerial(s.serial_number))) return;
        void c.deleteSerial(lineId, s.id);
      }}
      onReplaceSerial={(original, next) => void c.replaceSerial(lineId, original, next)}
    />
  );
}
