'use client';

/**
 * Unbox adapter for {@link ScanStationProgressControl}.
 *
 * Derives procedure % from {@link useUnboxProcedureSteps} and peeks the full
 * {@link UnboxProcedureChecklist} on hover while the right edge is closed.
 * Click opens Displays on `checklist` (or closes when checklist is showing;
 * switches from another tab).
 *
 * Mounted in the UnboxDockHost under-dock progress row (right-aligned under the
 * terminal). Hover peek is a Cursor-style `top-end` overlap just above the ring
 * (viewport-clamped) with a footer to open Displays. Checklist is ring-only —
 * not on the Displays strip. Other stations compose the shared control with
 * their own derivation + preview — do not fork a second ring.
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
      // Cursor-style overlap just above the dock ring (SoT).
      previewPlacement="top-end"
      previewRailActionLabel="Open in Displays"
      preview={
        <UnboxProcedureChecklist row={row} />
      }
    />
  );
}
