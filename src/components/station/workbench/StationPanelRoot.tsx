import type { ReactNode } from 'react';
import { cn } from '@/utils/_cn';
import { StationAmbientWash } from './StationAmbientWash';

/**
 * Station panel root — **SoT for the Unbox-family outer shell**: the
 * `relative flex h-full min-h-0 flex-col bg-surface-canvas` column plus the
 * {@link StationAmbientWash} depth backdrop. Compose this instead of
 * hand-rolling that recipe on every station right-pane (Unbox / Triage /
 * Testing …).
 *
 * The panel root hosts the ambient wash so the gradient covers identity + body;
 * the child {@link StationWorkbench} then passes `ambientWash={false}` + a
 * transparent background. Overlays (photo peek, modals) compose as children
 * (or around the root), not inside `StationWorkbench`.
 *
 * Guard: `station-workbench-chrome.guard.test.ts` (Guard C ratchets hand-rolled
 * panel-root strings in station paths down to this SoT).
 */
export function StationPanelRoot({
  children,
  /** Set false for a panel that supplies its own backdrop (rare). */
  wash = true,
  className,
}: {
  children: ReactNode;
  wash?: boolean;
  className?: string;
}) {
  return (
    <div className={cn('relative flex h-full min-h-0 flex-col bg-surface-canvas', className)}>
      {wash ? <StationAmbientWash /> : null}
      {children}
    </div>
  );
}
