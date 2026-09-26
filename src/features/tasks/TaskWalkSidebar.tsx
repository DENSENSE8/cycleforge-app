'use client';

/** Left column of the task record walk — Unbox context-panel resize grammar ({@link CONTEXT_PANEL_RESIZE} + trailing inset sash). */

import type { ReactNode } from 'react';
import {
  CONTEXT_PANEL_COLUMN_CLASS,
  CONTEXT_PANEL_RESIZE,
} from '@/components/sidebar/context-panel-column';
import { HorizontalEdgeResizeHandle } from '@/design-system/components/HorizontalEdgeResizeHandle';
import { useHorizontalEdgeResize } from '@/design-system/hooks';

export function TaskWalkSidebar({ children }: { children: ReactNode }) {
  const { width, edgeHandleProps, isDragging } = useHorizontalEdgeResize({
    storageKey: 'task-walk-rail-width',
    defaultWidth: CONTEXT_PANEL_RESIZE.defaultWidthPx,
    minWidth: CONTEXT_PANEL_RESIZE.minWidthPx,
    maxWidthPad: CONTEXT_PANEL_RESIZE.maxWidthPadPx,
    edge: 'trailing',
    label: 'Resize sidebar',
    testId: 'tasks-rail-resize',
  });

  return (
    <aside
      className={CONTEXT_PANEL_COLUMN_CLASS}
      style={{ width }}
      aria-label="Task queue"
      data-testid="tasks-rail"
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
