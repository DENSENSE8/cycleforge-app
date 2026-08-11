'use client';

/**
 * Unbox PO-line capture entry — one invariant {@link PoLineCaptureRow} per
 * line (condition + in-row Serial / Photos dock strip). Qty roll-up over
 * the display cap also mounts {@link BulkQuantityPanel} under the face.
 *
 * Not used for Units Displays flush (`ReceivingUnitRows`) or dock Band 1.
 */

import { useCallback, useState, type ReactNode } from 'react';
import { Button } from '@/design-system/primitives';
import { useScopedReceivingPhotos } from '@/hooks/useScopedReceivingPhotos';
import { getLast8Serial } from '@/lib/copy-chip-format';
import { BulkQuantityPanel } from '../BulkQuantityPanel';
import {
  UNIT_ROW_DISPLAY_CAP,
  resolveLineReceiveMode,
} from '../line-receive-mode';
import {
  markAllReceivingUnitsCondition,
  markReceivingUnitsConditionSplit,
} from '../receiving-label-helpers';
import type { SavedSerial } from '../SerialScanField';
import type { UnitLike, UnitSlotView } from '../UnitSlotList';
import { PoLineCaptureRow } from './PoLineCaptureRow';

export function PoLineUnitCaptureList({
  lineId,
  receivingId,
  quantityExpected,
  saved,
  units = null,
  lineCondition,
  disabled = false,
  serialAbsent = false,
  activeStep = null,
  staffId = 0,
  poRef = null,
  poRouteRef = null,
  onConditionChange,
  onAddSerial,
  onReplaceSerial,
  onMarkNoSerial,
  noSerialSlot,
  lookupBusy = false,
  editingSerial = null,
  onEditingSerialChange,
  autoFocusSerial = false,
  autoCommitDefaultGrade = false,
  onSerialPanelOpen,
  onArmCapture,
}: {
  lineId: number;
  receivingId: number | null;
  quantityExpected: number;
  saved: ReadonlyArray<UnitLike>;
  units?: ReadonlyArray<UnitSlotView> | null;
  lineCondition: string | null | undefined;
  disabled?: boolean;
  serialAbsent?: boolean;
  /** Moving-outline pointer for the controller-active line (see PoLineCaptureRow). */
  activeStep?: string | null;
  staffId?: number;
  poRef?: string | null;
  poRouteRef?: string | null;
  onConditionChange: (grade: string) => void;
  onAddSerial: (sn: string) => void | Promise<void>;
  onReplaceSerial?: (original: SavedSerial, nextSerial: string) => void;
  onMarkNoSerial?: () => void;
  noSerialSlot?: ReactNode;
  lookupBusy?: boolean;
  editingSerial?: SavedSerial | null;
  onEditingSerialChange?: (serial: SavedSerial | null) => void;
  autoFocusSerial?: boolean;
  /** Ungraded active line — stamp default USED_A once on mount. */
  autoCommitDefaultGrade?: boolean;
  onSerialPanelOpen?: () => void;
  /** Promote this line to the workspace controller before arming serial. */
  onArmCapture?: () => void;
}) {
  const [forceUnitMode, setForceUnitMode] = useState(false);

  const mode = resolveLineReceiveMode({
    quantityExpected,
    serialCount: saved.length,
    forceUnitMode,
  });

  const { photos: itemPhotos } = useScopedReceivingPhotos(
    {
      receivingId: receivingId ?? 0,
      receivingLineId: lineId,
    },
    { enabled: receivingId != null && receivingId > 0 && lineId > 0 },
  );
  const itemPhotoCount = itemPhotos.length;

  const latestSerial =
    [...saved]
      .map((s) => (s.serial_number || '').trim())
      .filter(Boolean)
      .at(-1) ?? null;
  const serialDone = saved.length > 0 || serialAbsent;

  const applyBulk = useCallback(
    (input: {
      primaryGrade: string;
      primaryCount: number;
      secondaryGrade: string | null;
    }) => {
      onConditionChange(input.primaryGrade);
      if (input.secondaryGrade && input.primaryCount < quantityExpected) {
        markReceivingUnitsConditionSplit(
          lineId,
          input.primaryGrade,
          input.primaryCount,
          input.secondaryGrade,
          units,
        );
        return;
      }
      markAllReceivingUnitsCondition(lineId, input.primaryGrade, units);
    },
    [lineId, onConditionChange, quantityExpected, units],
  );

  const captureFace = (
    <PoLineCaptureRow
      condition={lineCondition}
      onConditionChange={onConditionChange}
      serialDone={serialDone}
      latestSerial={latestSerial ? getLast8Serial(latestSerial) : null}
      noSerialActive={serialAbsent}
      photoCount={itemPhotoCount}
      showPhotos={receivingId != null && receivingId > 0}
      receivingId={receivingId}
      lineId={lineId}
      staffId={staffId}
      poRef={poRef}
      poRouteRef={poRouteRef}
      activeStep={activeStep}
      disabled={disabled}
      saved={saved}
      onAddSerial={onAddSerial}
      onReplaceSerial={onReplaceSerial}
      onMarkNoSerial={onMarkNoSerial}
      noSerialSlot={noSerialSlot}
      lookupBusy={lookupBusy}
      editingSerial={editingSerial}
      onEditingSerialChange={onEditingSerialChange}
      autoFocusSerial={autoFocusSerial}
      autoCommitDefaultGrade={autoCommitDefaultGrade}
      focusKey={lineId}
      onSerialPanelOpen={onSerialPanelOpen}
      onArmCapture={onArmCapture}
    />
  );

  if (mode === 'qtyRollup') {
    return (
      <div
        className="min-w-0 space-y-0"
        data-po-line-unit-capture
        data-receive-mode="qtyRollup"
      >
        {captureFace}
        <BulkQuantityPanel
          quantityExpected={quantityExpected}
          lineCondition={lineCondition}
          disabled={disabled}
          hideCondition
          progressive
          onApply={applyBulk}
          onTrackEachUnit={() => setForceUnitMode(true)}
        />
      </div>
    );
  }

  const showReceiveAsBulk =
    forceUnitMode &&
    quantityExpected > UNIT_ROW_DISPLAY_CAP &&
    saved.length === 0;

  return (
    <div
      className="min-w-0 space-y-2"
      data-po-line-unit-capture
      data-receive-mode="unitTrack"
    >
      {captureFace}
      {showReceiveAsBulk ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled}
          onClick={() => setForceUnitMode(false)}
        >
          Receive remaining as quantity
        </Button>
      ) : null}
    </div>
  );
}
