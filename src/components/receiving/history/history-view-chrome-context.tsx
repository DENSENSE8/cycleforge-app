'use client';

/**
 * Cross-tree bridge for Unbox History View topics — sheet layout chrome lives
 * in {@link HistoryCartonTriagePanel} while the grid (zoom style, ▦ portal)
 * stays under {@link UnboxWorkspaceView}. Query facets (staff · scope · week ·
 * field) live on Band 3 Refine, not this bridge.
 *
 * Provider mounts on the Unbox right-pane host so the workspace + History rail
 * share one controls portal target + zoom + KPI collapse state.
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  GRID_ZOOM_DEFAULT,
  readStoredGridZoom,
  type GridZoomPercent,
} from '@/design-system/components/grid/grid-zoom';
import { useWorkbenchKpiCollapsed } from '@/hooks/useWorkbenchKpiCollapsed';
import { WORKBENCH_KPI_SURFACE } from '@/components/dashboard/workbench-kpi-collapse';

type HistoryViewChromeValue = {
  /** Portal host for ▦ column trigger (inside View cluster). Week / staff live on Band 3 Refine. */
  controlsEl: HTMLElement | null;
  setControlsEl: (el: HTMLElement | null) => void;
  zoom: GridZoomPercent;
  setZoom: (z: GridZoomPercent) => void;
  kpiOpen: boolean;
  onToggleKpi: () => void;
  /** View-only shell open (no carton target) — Band 3 can open layout chrome. */
  viewShellOpen: boolean;
  setViewShellOpen: (open: boolean) => void;
};

const HistoryViewChromeContext = createContext<HistoryViewChromeValue | null>(null);

export function HistoryViewChromeProvider({ children }: { children: ReactNode }) {
  const [controlsEl, setControlsEl] = useState<HTMLElement | null>(null);
  const [zoom, setZoomState] = useState<GridZoomPercent>(() => {
    if (typeof window === 'undefined') return GRID_ZOOM_DEFAULT;
    return readStoredGridZoom();
  });
  const [viewShellOpen, setViewShellOpen] = useState(false);
  const { collapsed: kpiCollapsed, setCollapsed: setKpiCollapsed } =
    useWorkbenchKpiCollapsed(WORKBENCH_KPI_SURFACE.unbox);

  const setZoom = useCallback((z: GridZoomPercent) => {
    setZoomState(z);
  }, []);

  const onToggleKpi = useCallback(() => {
    setKpiCollapsed(!kpiCollapsed);
  }, [kpiCollapsed, setKpiCollapsed]);

  const value = useMemo(
    () => ({
      controlsEl,
      setControlsEl,
      zoom,
      setZoom,
      kpiOpen: !kpiCollapsed,
      onToggleKpi,
      viewShellOpen,
      setViewShellOpen,
    }),
    [
      controlsEl,
      zoom,
      setZoom,
      kpiCollapsed,
      onToggleKpi,
      viewShellOpen,
    ],
  );

  return (
    <HistoryViewChromeContext.Provider value={value}>
      {children}
    </HistoryViewChromeContext.Provider>
  );
}

/**
 * Re-provides the chrome across a `RightRailHost` re-parent. Registered rail
 * nodes render inside the host's subtree, not where their JSX was written, so
 * the value has to be read in the provider's tree with
 * {@link useHistoryViewChromeOptional} and handed over as a prop.
 */
export function HistoryViewChromeBridge({
  value,
  children,
}: {
  value: HistoryViewChromeValue | null;
  children: ReactNode;
}) {
  return (
    <HistoryViewChromeContext.Provider value={value}>
      {children}
    </HistoryViewChromeContext.Provider>
  );
}

export function useHistoryViewChrome(): HistoryViewChromeValue {
  const ctx = useContext(HistoryViewChromeContext);
  if (!ctx) {
    throw new Error('useHistoryViewChrome requires HistoryViewChromeProvider');
  }
  return ctx;
}

/** Safe read when the provider may be absent (non-Unbox mounts). */
export function useHistoryViewChromeOptional(): HistoryViewChromeValue | null {
  return useContext(HistoryViewChromeContext);
}
