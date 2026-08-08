'use client';

/**
 * Cross-tree bridge for the Unbox **View** topics — sheet layout chrome lives
 * in {@link HistoryCartonTriagePanel} while the grid (zoom style, ▦ portal)
 * stays under {@link UnboxWorkspaceView}. Query facets (staff · scope · week ·
 * field) live on Band 3 Refine, not this bridge.
 *
 * Provider mounts on the Unbox right-pane host, so every Unbox tab — not only
 * History — shares one controls portal target and one zoom value.
 *
 * **KPI collapse is deliberately NOT here (2026-08-08).** Band 3 is the one KPI
 * door; a View-cluster twin would be unreachable exactly when it is wanted
 * (the inspector parked). See `source-of-truth.md` → Find-only Band 3.
 *
 * **The zoom chords live here, not in {@link UnboxCompareChrome}.** That
 * component now mounts only inside the rail cluster, so a listener bound in it
 * would die whenever the inspector is closed — a silent loss of function with
 * no missing control to notice. The provider spans the whole Unbox subtree, so
 * ⌘+ / ⌘- / ⌘0 survive rail state.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  GRID_ZOOM_DEFAULT,
  readStoredGridZoom,
  stepGridZoom,
  writeStoredGridZoom,
  type GridZoomPercent,
} from '@/design-system/components/grid/grid-zoom';

type HistoryViewChromeValue = {
  /** Portal host for ▦ column trigger (inside View cluster). Week / staff live on Band 3 Refine. */
  controlsEl: HTMLElement | null;
  setControlsEl: (el: HTMLElement | null) => void;
  zoom: GridZoomPercent;
  setZoom: (z: GridZoomPercent) => void;
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

  const setZoom = useCallback((z: GridZoomPercent) => {
    setZoomState(z);
    writeStoredGridZoom(z);
  }, []);

  // Read the live zoom inside the key handler without re-binding the listener
  // on every step.
  const zoomRef = useRef(zoom);
  zoomRef.current = zoom;

  // ⌘+ / ⌘- / ⌘0 — bound at the provider, not in the rail cluster, so zoom
  // survives a closed inspector (see the docblock).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        setZoom(stepGridZoom(zoomRef.current, 1));
      } else if (e.key === '-') {
        e.preventDefault();
        setZoom(stepGridZoom(zoomRef.current, -1));
      } else if (e.key === '0') {
        e.preventDefault();
        setZoom(GRID_ZOOM_DEFAULT);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setZoom]);

  // A carton opening owns the right edge (LineEditPanel / the station Displays
  // column). Leaving the View-only shell registered would put a second full
  // right column beside it — the dual-right-column ban. `historyTriage` is
  // cleared on these same two events by `useReceivingDetailOverlays`; the shell
  // is owned here, so it is cleared here.
  useEffect(() => {
    const close = () => setViewShellOpen(false);
    window.addEventListener('receiving-workspace-open', close);
    window.addEventListener('receiving-select-line', close);
    return () => {
      window.removeEventListener('receiving-workspace-open', close);
      window.removeEventListener('receiving-select-line', close);
    };
  }, []);

  const value = useMemo(
    () => ({
      controlsEl,
      setControlsEl,
      zoom,
      setZoom,
      viewShellOpen,
      setViewShellOpen,
    }),
    [controlsEl, zoom, setZoom, viewShellOpen],
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
