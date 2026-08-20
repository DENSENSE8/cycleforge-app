'use client';

/**
 * Testing bottom dock — station-local host (not the shared notes floor).
 *
 * Panel row: leading QC CTA · trailing Pass · Print (carton-scoped; Displays
 * never re-labels it). Under-dock = step label. Notes mount *below* the Panel
 * (composer height) — never stuffed into the h-11 CTA band.
 */

import type { ReactNode } from 'react';
import { Panel } from '@/design-system/primitives';

export function TestingDockHost({
  leading,
  trailing,
  stepContext,
  notes,
}: {
  /** Active QC dock control (e.g. As listed / Not as listed). */
  leading: ReactNode;
  /** Pass · Print StationTerminalDock. */
  trailing: ReactNode;
  /** Under-dock step label (status-bar density). */
  stepContext?: ReactNode;
  /** Notes composer — below the CTA Panel, not inside the h-11 band. */
  notes?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1" data-testing-dock>
      <Panel
        padding="sm"
        radius="2xl"
        elevation="raised"
        className="flex min-w-0 flex-col"
        data-testing-dock-shell
      >
        <div className="flex h-11 min-w-0 items-center gap-2">
          <div className="flex h-11 min-w-0 flex-1 items-center overflow-x-auto overflow-y-hidden">
            {leading}
          </div>
          <div className="shrink-0">{trailing}</div>
        </div>
      </Panel>
      {stepContext ? (
        <div
          className="flex min-h-0 min-w-0 items-center gap-1.5 px-1 leading-none"
          data-testing-dock-progress
        >
          {stepContext}
        </div>
      ) : null}
      {notes ? <div className="min-w-0">{notes}</div> : null}
    </div>
  );
}
