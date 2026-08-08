'use client';

/**
 * Unbox adapter for {@link ScanStationProgressControl}.
 *
 * Derives procedure % from {@link useUnboxProcedureSteps}. Mounted under the
 * Unbox dock (`UnboxDockHost` `progress` slot, bottom-right) with compact
 * `variant="default"` — status-bar density beside the active step pager
 * (bottom-left). Click opens the Checklist Displays leaf in-station — never a
 * route hop.
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
      variant="default"
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
      previewRailActionLabel="Open displays"
      preview={<UnboxProcedureChecklist row={row} />}
    />
  );
}
