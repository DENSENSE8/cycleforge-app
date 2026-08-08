'use client';

/**
 * Workbench inspector action floor — Macro column floor for desk triage
 * RightRailHost record peeks.
 *
 * Composes `FlushTerminalFooter` (Claim shell). Optional `above` (expand
 * panels / notes), leading context, labelled `actions` cluster, and flush
 * trailing Delete (`InspectorFlushDelete`). Returns null when empty — never
 * mount an empty bar. Not for Station Displays / station docks.
 *
 * Law: `.claude/rules/display/right-rail-inspector.md` · SoT Macro CTA.
 */

import type { ReactNode } from 'react';
import { FlushTerminalFooter } from '@/design-system/primitives';
import { cn } from '@/utils/_cn';

export function InspectorActionFloor({
  above,
  leading,
  actions,
  delete: deleteSlot,
  className,
  'data-testid': testId = 'inspector-action-floor',
}: {
  /** Expand hosts / notes composer seated above the Macro bar. */
  above?: ReactNode;
  /** Left-side context (Copy, backup note, selection count). */
  leading?: ReactNode;
  /** Labelled update / resolve CTA cluster (flex-1 when present). */
  actions?: ReactNode;
  /** Flush trailing Delete — usually `<InspectorFlushDelete />`. */
  delete?: ReactNode;
  className?: string;
  'data-testid'?: string;
}) {
  const hasBar = leading != null || actions != null || deleteSlot != null;
  if (above == null && !hasBar) return null;

  const barLeading =
    actions != null ? (
      <div className="flex min-w-0 flex-1 items-stretch">
        {leading != null ? (
          <div className="flex shrink-0 items-stretch">{leading}</div>
        ) : null}
        <div
          className="flex min-w-0 flex-1 items-stretch divide-x divide-border-hairline overflow-x-auto no-scrollbar"
          data-testid={`${testId}-actions`}
        >
          {actions}
        </div>
      </div>
    ) : leading != null ? (
      leading
    ) : undefined;

  return (
    <div className={cn('shrink-0', className)} data-testid={testId}>
      {above != null ? (
        <div className="border-t border-border-hairline bg-surface-canvas">
          {above}
        </div>
      ) : null}
      {hasBar ? (
        <FlushTerminalFooter
          layout="cluster"
          leading={barLeading}
          data-testid={`${testId}-bar`}
        >
          {deleteSlot}
        </FlushTerminalFooter>
      ) : null}
    </div>
  );
}
