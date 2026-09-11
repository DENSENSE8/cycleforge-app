'use client';

/**
 * Left column of the exceptions record walk — Unbox context-panel resize
 * grammar ({@link CONTEXT_PANEL_RESIZE} + trailing inset sash). Queue only;
 * pairing lives under the carton header. No title/subtitle band — impact
 * order is the sort, not a caption.
 */

import type { ReactNode } from 'react';
import {
  CONTEXT_PANEL_COLUMN_CLASS,
  CONTEXT_PANEL_RESIZE,
} from '@/components/sidebar/context-panel-column';
import { HorizontalEdgeResizeHandle } from '@/design-system/components/HorizontalEdgeResizeHandle';
import { useHorizontalEdgeResize } from '@/design-system/hooks';

export function ExceptionsWalkSidebar({ children }: { children: ReactNode }) {
  const { width, edgeHandleProps, isDragging } = useHorizontalEdgeResize({
    storageKey: 'exceptions-walk-rail-width',
    defaultWidth: CONTEXT_PANEL_RESIZE.defaultWidthPx,
    minWidth: CONTEXT_PANEL_RESIZE.minWidthPx,
    maxWidthPad: CONTEXT_PANEL_RESIZE.maxWidthPadPx,
    edge: 'trailing',
    label: 'Resize sidebar',
    testId: 'exceptions-rail-resize',
  });

  return (
    <aside
      className={CONTEXT_PANEL_COLUMN_CLASS}
      style={{ width }}
      aria-label="Exception queue"
      data-testid="exceptions-rail"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">{children}</div>
      <HorizontalEdgeResizeHandle
        edgeHandleProps={edgeHandleProps}
        isDragging={isDragging}
        edge="trailing"
        placement="inset"
        tooltipLabel="Resize sidebar"
      />
    </aside>
  );
}
