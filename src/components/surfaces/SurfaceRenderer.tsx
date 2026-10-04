'use client';

/** SurfaceRenderer — mounts a surface's published `station_definitions` composition on a real page (Studio-driven operator-surfaces… */

import { getSurface, type SurfaceKey } from '@/lib/stations/surface-keys';
import { StationSlot } from '@/components/stations/StationSlot';
import { ACTION_DOCK_LIFT, ACTION_DOCK_TOP_GAP } from '@/design-system/tokens/dock-clearance';

export function SurfaceRenderer({ surfaceKey }: { surfaceKey: SurfaceKey }) {
  const surface = getSurface(surfaceKey);
  const slotProps = { pageKey: surface.pageKey, modeKey: surface.modeKey, stationLabel: surface.label };

  // Station archetype scaffold: focus-locked trigger pinned on top, then a
  // master queue + a workspace body, the advance verbs floating at the foot —
  // no bar or rule behind them (owner 2026-10-03). Linear vertical scaffold,
  // no grids (ui-design-system.md).
  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-surface-canvas">
      <div className="shrink-0 border-b border-border-hairline bg-surface-card p-2">
        <StationSlot {...slotProps} slot="trigger" />
      </div>
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="w-80 shrink-0 overflow-y-auto border-r border-border-hairline bg-surface-card">
          <StationSlot {...slotProps} slot="queue" />
        </aside>
        <div className="min-w-0 flex-1 overflow-y-auto p-2">
          <StationSlot {...slotProps} slot="workspace" />
        </div>
      </div>
      <div className={`shrink-0 px-2 ${ACTION_DOCK_TOP_GAP} ${ACTION_DOCK_LIFT}`}>
        <StationSlot {...slotProps} slot="advance" />
      </div>
    </div>
  );
}
