'use client';

/**
 * Unbox adapter for {@link ScanStationProgressControl}.
 *
 * Derives procedure % from {@link useUnboxProcedureSteps}. Mounted as the
 * Displays icon-plate `rightSlot` (same row, right of ⋮) via
 * {@link ReceivingDisplaysPushStack} with `variant="strip"` — centered h-10
 * cell, selected underline when checklist is live. Click opens/switches to
 * the `stripHidden` checklist body (does not close Displays; `→|` does).
 *
 * Closed Displays opens via `←|`, then the ring. Checklist is ring-only —
 * never a strip Lucide cell. Other stations compose the shared control with
 * their own derivation — do not fork a second ring.
 */

import { useCallback, useMemo } from 'react';
import { ScanStationProgressControl } from '@/components/station/ScanStationProgressControl';
import { UnboxProcedureChecklist } from './line-edit/UnboxProcedureChecklist';
import { useUnboxProcedureSteps } from './line-edit/useUnboxProcedureSteps';
import type { ReceivingLineRow } from '@/components/station/receiving-line-row';

export function UnboxScanProgressControl({
  row,
  /** Any right-edge push open (Displays / Ticket / Claim / tool) — disables hover. */
  railOpen,
  /** Displays column open on the checklist body. */
  checklistActive,
  onOpenChecklist,
  onCloseDisplays,
}: {
  row: ReceivingLineRow;
  railOpen: boolean;
  checklistActive: boolean;
  onOpenChecklist: () => void;
  onCloseDisplays: () => void;
}) {
  const { steps } = useUnboxProcedureSteps(row);

  const done = useMemo(
    () => steps.filter((s) => s.state === 'done').length,
    [steps],
  );
  const total = steps.length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  const onOpen = useCallback(() => onOpenChecklist(), [onOpenChecklist]);
  const onClose = useCallback(() => onCloseDisplays(), [onCloseDisplays]);

  return (
    <ScanStationProgressControl
      variant="strip"
      percent={percent}
      done={done}
      total={total}
      railOpen={railOpen}
      expanded={checklistActive}
      selected={checklistActive}
      onOpen={onOpen}
      onClose={onClose}
      testId="unbox-displays-expand-button"
      previewAriaLabel="Unbox procedure checklist preview"
      previewPlacement="top-end"
      previewRailActionLabel="Open in Displays"
      preview={<UnboxProcedureChecklist row={row} />}
    />
  );
}
