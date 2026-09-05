'use client';

/**
 * What the navigator becomes when it throws.
 *
 * It used to become `null` — the spine simply disappeared, with no message and
 * no way back, which is the worst version of an error state: the operator
 * cannot tell a crash from a feature they misremembered. A navigator that fails
 * must still say so and still offer a way out, at the width it was occupying.
 */

import { Button } from '@/design-system/primitives';
import {
  SIDEBAR_SPINE_RESIZE,
  SPINE_ROW_DENSITY,
} from '@/components/sidebar/sidebar-spine';
import { cn } from '@/utils/_cn';

export function SpineErrorFallback({ reset }: { reset: () => void }) {
  return (
    <div
      role="alert"
      // Widths itself from the spine token: the boundary sits OUTSIDE the
      // column, so on a throw this becomes the flex child directly and would
      // otherwise take whatever width is going.
      style={{ width: SIDEBAR_SPINE_RESIZE.defaultWidthPx }}
      className="flex h-full shrink-0 flex-col gap-2 border-r border-border-soft bg-surface-card p-3"
    >
      <p className={cn(SPINE_ROW_DENSITY.pointer.label, 'text-text-default')}>
        Navigation stopped
      </p>
      <p className="text-role-caption text-text-soft">
        The page list failed to load. Your work is unaffected — every destination
        is still reachable from the command palette (⌘K).
      </p>
      <Button size="sm" variant="secondary" onClick={reset}>
        Reload navigation
      </Button>
    </div>
  );
}
