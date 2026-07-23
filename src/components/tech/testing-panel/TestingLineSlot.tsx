import { requestConfirm } from '@/design-system/components/confirm';
import { ActiveLineTestingSerial, type UnitSlotSerial } from './ActiveLineTestingSerial';
import type { TestingController } from './testing-panel-types';

/** Shared confirm before removing a serial. */
export async function confirmDeleteSerial(serialNumber: string): Promise<boolean> {
  return requestConfirm({
    description: `Remove serial ${serialNumber}?`,
    tone: 'danger',
    confirmLabel: 'Remove',
  });
}

/**
 * The verdict/serial slot for one testing line. Used by BOTH the unmatched
 * (`renderLineActions`) and the PO accordion (`activeRowSlot`) paths — the only
 * differences are the line id, expected count, disabled state, selected index,
 * and the PO-only header-serial editing affordances, all passed in.
 */
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
      selectedIndex={selectedIndex}
      onSelectIndex={(i) => c.setActiveSlotByLine((m) => ({ ...m, [lineId]: i }))}
      onSetVerdict={(next) => void c.applyLineVerdict(lineId, serials, next)}
      onSetUnitVerdict={(serial, next) => void c.handleSlotVerdict(lineId, serial, next)}
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
