'use client';

import { useMemo } from 'react';
import { resolveTerminalKind, type TerminalActionVm, type TerminalWorkspaceMode } from '@/lib/station-terminal';
import type { SurfaceKey } from '@/lib/stations/surface-keys';

export interface UseStationTerminalActionParams {
  surface: SurfaceKey;
  mode: TerminalWorkspaceMode;
  tabId?: string | null;
  /** Mode builder — called with the resolved kind (never `'none'`). */
  build: (kind: string) => TerminalActionVm | null;
}

/**
 * Resolves the active tab's terminal kind, then delegates VM assembly to the
 * mode-specific `build` callback. Returns `null` when the dock should hide.
 */
export function useStationTerminalAction({
  surface: _surface,
  mode,
  tabId = null,
  build,
}: UseStationTerminalActionParams): TerminalActionVm | null {
  // `surface` is part of the public key tuple (page × mode × tab) for call-site
  // clarity / future per-surface overrides; kind resolution is mode-scoped today.
  return useMemo(() => {
    const kind = resolveTerminalKind({ mode, tabId });
    if (kind == null) return null;
    return build(kind);
  }, [mode, tabId, build]);
}
