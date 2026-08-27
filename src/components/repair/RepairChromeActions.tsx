'use client';

/**
 * Repair workbench-chrome CTA — Add, as the Band-1 cube every scan station's
 * chrome row uses ({@link WORKBENCH_CHROME_CUBE_CLASS}). Twin of
 * {@link OutboundOrderChromeActions} / {@link IncomingChromeActions} without
 * Import. Repair hosts no workbench strip, so there is no resume CTA beside it.
 */

import { Plus } from '@/components/Icons';
import {
  WorkbenchChromeCubeButton,
  WORKBENCH_CHROME_CUBE_GLYPH_CLASS,
} from '@/components/dashboard/workbench-chrome-cube';
import { WorkbenchChromeActionRow } from '@/components/dashboard/workbench-shell';

export function RepairChromeActions({
  onAdd,
  disabled = false,
}: {
  onAdd: () => void;
  disabled?: boolean;
}) {
  return (
    <WorkbenchChromeActionRow>
    <WorkbenchChromeCubeButton
      label="New repair order"
      icon={<Plus className={WORKBENCH_CHROME_CUBE_GLYPH_CLASS} />}
      onClick={onAdd}
      disabled={disabled}
      data-testid="repair-chrome-add"
    />
    </WorkbenchChromeActionRow>
  );
}
