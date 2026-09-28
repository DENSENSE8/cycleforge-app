'use client';

import type { ReactNode, RefObject } from 'react';
import { X } from '@/components/Icons';
import { Button, IconButton } from '@/design-system/primitives';
import { RightPaneOverlay } from '@/components/ui/RightPaneOverlay';
import { ConditionPills } from './ConditionPills';
import { ConditionBadge } from './ConditionBadge';
import { UnitSlotList, type UnitLike, type UnitSlotView } from './UnitSlotList';
import { UNIT_ROW_DISPLAY_CAP } from './line-receive-mode';
import type { SerialAbsentState } from './line-edit/NoSerialControl';

interface Props {
  open: boolean;
  onClose: () => void;
  total: number;
  saved: ReadonlyArray<UnitLike>;
  units?: ReadonlyArray<UnitSlotView> | null;
  selectedIndex: number;
  onSelect: (index: number) => void;
  disabled?: boolean;
  isSubmitting?: boolean;
  requireSerialConfirmation?: boolean;
  gradeFor: (serial: UnitLike | null, index: number) => string | null;
  onCommitSlotGrade: (index: number, grade: string) => void;
  onAddSerial: (index: number, serial: string) => void | Promise<void>;
  onDeleteSerial: (serial: UnitLike) => void;
  onReplaceSerial: (original: UnitLike, next: string) => void;
  onMarkUnitNoSerial?: (unitId: number) => void;
  onUnitSerialAbsentChange?: (unitId: number, next: SerialAbsentState) => void;
  serialEditTarget?: UnitLike | null;
  serialInputRef?: RefObject<HTMLInputElement | null>;
  /** Apply the master grade to every still-empty unit. */
  onApplyGradeToRemaining?: () => void;
  /** Switch back to qty roll-up for unfilled slots. */
  onReceiveRemainingAsBulk?: () => void;
  masterPills?: ReactNode;
}

/**
 * Focused overlay for managing units beyond the accordion display cap.
 * Still windows to {@link UNIT_ROW_DISPLAY_CAP} — never dumps all N rows.
 */
export function UnitSlotsManageOverlay({
  open,
  onClose,
  total,
  saved,
  units = null,
  selectedIndex,
  onSelect,
  disabled = false,
  isSubmitting = false,
  requireSerialConfirmation = false,
  gradeFor,
  onCommitSlotGrade,
  onAddSerial,
  onDeleteSerial,
  onReplaceSerial,
  onMarkUnitNoSerial,
  onUnitSerialAbsentChange,
  serialEditTarget = null,
  serialInputRef,
  onApplyGradeToRemaining,
  onReceiveRemainingAsBulk,
  masterPills,
}: Props) {
  return (
    <RightPaneOverlay
      open={open}
      onClose={onClose}
      align="center"
      resizable
      storageKey="receiving-unit-slots-manage-size"
      minWidth={420}
      minHeight={360}
      className="-mt-8 h-[min(86vh,40rem)] w-[min(94vw,36rem)]"
      aria-label="Manage receiving units"
    >
      <div className="flex items-center justify-between border-b border-border-soft px-4 py-3">
        <div className="min-w-0">
          <p className="text-role-micro text-text-soft">
            Units
          </p>
          <p className="truncate text-xs font-semibold text-text-default">
            {total} expected · showing up to {UNIT_ROW_DISPLAY_CAP} at a time
          </p>
        </div>
        <IconButton
          onClick={onClose}
          ariaLabel="Close"
          icon={<X className="h-4 w-4" />}
          className="rounded p-1 text-text-faint hover:bg-surface-sunken hover:text-text-muted"
        />
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3">
        {masterPills ? <div className="px-1">{masterPills}</div> : null}
        <UnitSlotList
          total={total}
          saved={saved}
          units={units}
          selectedIndex={selectedIndex}
          onSelect={onSelect}
          disabled={disabled}
          isSubmitting={isSubmitting}
          requireSerialConfirmation={requireSerialConfirmation}
          onMarkUnitNoSerial={onMarkUnitNoSerial}
          onUnitSerialAbsentChange={onUnitSerialAbsentChange}
          singleRowExpanded
          maxVisible={UNIT_ROW_DISPLAY_CAP}
          renderExpandedMeta={(serial, index) => (
            <ConditionPills
              value={gradeFor(serial, index)}
              onChange={(next) => {
                onSelect(index);
                onCommitSlotGrade(index, next);
              }}
            />
          )}
          renderCollapsedMeta={(serial, index) => (
            <ConditionBadge grade={gradeFor(serial, index)} />
          )}
          onAddSerial={onAddSerial}
          onDeleteSerial={onDeleteSerial}
          onReplaceSerial={onReplaceSerial}
          serialEditTarget={serialEditTarget}
          primaryInputRef={serialInputRef}
          overflowSlot={
            total > UNIT_ROW_DISPLAY_CAP ? (
              <p className="text-role-caption text-text-soft">
                Select a later unit (or scan forward) to slide the window —
                {total - UNIT_ROW_DISPLAY_CAP} more beyond this view.
              </p>
            ) : null
          }
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-border-soft px-4 py-3">
        {onApplyGradeToRemaining ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={disabled}
            onClick={onApplyGradeToRemaining}
          >
            Apply grade to remaining empty
          </Button>
        ) : null}
        {onReceiveRemainingAsBulk ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={() => {
              onReceiveRemainingAsBulk();
              onClose();
            }}
          >
            Receive remaining as quantity
          </Button>
        ) : null}
      </div>
    </RightPaneOverlay>
  );
}
