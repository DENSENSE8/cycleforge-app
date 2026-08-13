'use client';

/**
 * Compact Column display control for a desk inspector chrome row.
 *
 * Band 3 no longer paints ▦. Show inspector opens the panel when the rail is
 * empty; this button is the door while a record inspector already occupies
 * the slot (Incoming details, Repair, …).
 */

import { ColumnsThree } from '@/components/Icons';
import { HoverTooltip } from '@/components/ui/HoverTooltip';
import { IconButton } from '@/design-system/primitives';
import { requestOpenGridColumnDetails } from '@/design-system/components/grid/grid-column-details-open';

export function InspectorColumnDisplayButton({
  testId = 'inspector-column-display',
}: {
  testId?: string;
}) {
  return (
    <HoverTooltip label="Column display" asChild>
      <IconButton
        size="xs"
        tone="neutral"
        ariaLabel="Column display"
        icon={<ColumnsThree className="h-3.5 w-3.5" />}
        onClick={requestOpenGridColumnDetails}
        data-testid={testId}
      />
    </HoverTooltip>
  );
}
