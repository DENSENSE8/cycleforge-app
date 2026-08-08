'use client';

/**
 * Lets route context panels (e.g. Unbox Recent filter footer) write the same
 * {@link CONTEXT_PANEL_COLLAPSE} preference owned by {@link ContextPanelLayout}
 * — without prop-drilling through `SidebarContextPanel`.
 *
 * Also carries optional mid-strip MRU pins published by every
 * {@link SidebarRecentRailBase} (default on) and a mini scan session published
 * by primary {@link StationScanBar}s so {@link LeftDockCollapseStrip} can peek
 * pins + arm a new scan while the panel is parked.
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
import type { StationTheme } from '@/utils/staff-colors';

/** Ctx shared with open-rail {@link SidebarRailShellProps.renderPopover}. */
export type CollapseStripPeekCtx = {
  openWorkspace: () => void;
  dismiss: () => void;
};

/** One status-dot pin in the parked left-dock strip. */
export type CollapseStripPin = {
  id: string | number;
  /** Primary tooltip / accessible name (carton / PO title). */
  label: string;
  /** Tailwind bg class for the status dot (same as open-rail `getStatusDot`). */
  statusDotClass: string;
  /** Optional short status for the tooltip suffix. */
  statusLabel?: string;
  /** Secondary identity line (tracking · PO · SKU) — text-peek fallback. */
  meta?: string;
  /** Relative age on the feed's sort axis (e.g. "3h") — text-peek fallback. */
  age?: string;
  /** Active row — ring matches open-rail `RailRow` selection. */
  selected?: boolean;
  /** Select/open the carton — keep the rail collapsed. */
  onSelect: () => void;
  /**
   * Same hover card the open rail paints (`renderPopover` / Receiving copy chips).
   * When set, parked pins open {@link RailPopover} instead of a text tip.
   */
  renderPeek?: (ctx: CollapseStripPeekCtx) => ReactNode;
};

/** Mid-strip MRU snapshot — pin faces + open-rail visible total for +N overflow. */
type CollapseMruSnapshot = {
  pins: CollapseStripPin[];
  /** Visible row count on the open rail (before mid-strip cap). */
  totalCount: number;
};

/**
 * Mini scan session for the parked strip — shares the open-rail
 * {@link StationScanBar} value / submit while the panel is `inert`.
 */
export type CollapseStripScan = {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  placeholder: string;
  /** Staff/theme bottom-rule classes (same chrome as the open bar). */
  bottomRuleClass: string;
  /** Idle Plus hover wash + bottom-rule preview in the staff theme. */
  hoverClass: string;
  /**
   * Staff theme for the bottom-up {@link ScanBandGlowHost} glow while focused
   * (same chromatic depth as the open-rail scan band).
   */
  theme: StationTheme;
};

type ContextPanelCollapseApi = {
  /** Park the left context rail (operator preference). */
  collapse: () => void;
  /** Restore a parked context rail. */
  expand: () => void;
  /** Park ↔ restore — same action as ⌘/Ctrl+B. */
  toggle: () => void;
  /** Mid-strip MRU snapshot from the active rail feed (null = none). */
  collapseMru: CollapseMruSnapshot | null;
  setCollapseMru: (next: CollapseMruSnapshot | null) => void;
  /** Top-of-strip mini scan session from the primary StationScanBar (null = none). */
  collapseScan: CollapseStripScan | null;
  setCollapseScan: (next: CollapseStripScan | null) => void;
};

const ContextPanelCollapseContext = createContext<ContextPanelCollapseApi | null>(
  null,
);

export function ContextPanelCollapseProvider({
  collapse,
  expand,
  toggle,
  children,
}: {
  collapse: () => void;
  expand: () => void;
  toggle: () => void;
  children: ReactNode;
}) {
  const [collapseMru, setCollapseMruState] = useState<CollapseMruSnapshot | null>(
    null,
  );
  const [collapseScan, setCollapseScanState] = useState<CollapseStripScan | null>(
    null,
  );
  const setCollapseMru = useCallback((next: CollapseMruSnapshot | null) => {
    setCollapseMruState(next);
  }, []);
  const setCollapseScan = useCallback((next: CollapseStripScan | null) => {
    setCollapseScanState(next);
  }, []);
  const value = useMemo(
    () => ({
      collapse,
      expand,
      toggle,
      collapseMru,
      setCollapseMru,
      collapseScan,
      setCollapseScan,
    }),
    [
      collapse,
      expand,
      toggle,
      collapseMru,
      setCollapseMru,
      collapseScan,
      setCollapseScan,
    ],
  );
  return (
    <ContextPanelCollapseContext.Provider value={value}>
      {children}
    </ContextPanelCollapseContext.Provider>
  );
}

/** Returns null when no context panel is mounted (panel-less routes). */
export function useContextPanelCollapse(): ContextPanelCollapseApi | null {
  return useContext(ContextPanelCollapseContext);
}

/**
 * Publish mid-strip MRU while this feed is mounted; clear on unmount or when
 * the snapshot is null/empty. No-op outside {@link ContextPanelCollapseProvider}.
 *
 * Deps on a content signature (not the snapshot identity) so fresh `onSelect`
 * closures each render do not loop the provider. Latest handlers ride a ref.
 */
export function usePublishCollapsePins(snapshot: CollapseMruSnapshot | null) {
  const api = useContextPanelCollapse();
  const setCollapseMru = api?.setCollapseMru;
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;
  const pins = snapshot?.pins ?? null;
  const signature =
    pins && pins.length > 0
      ? `${snapshot?.totalCount ?? 0}\n${pins
          .map(
            (p) =>
              `${String(p.id)}\0${p.label}\0${p.statusDotClass}\0${p.statusLabel ?? ''}\0${p.meta ?? ''}\0${p.age ?? ''}\0${p.selected ? '1' : '0'}\0${p.renderPeek ? '1' : '0'}`,
          )
          .join('\n')}`
      : '';

  useEffect(() => {
    if (!setCollapseMru) return;
    const source = snapshotRef.current;
    if (!source || source.pins.length === 0) {
      setCollapseMru(null);
      return;
    }
    setCollapseMru({
      totalCount: source.totalCount,
      pins: source.pins.map((p) => ({
        id: p.id,
        label: p.label,
        statusDotClass: p.statusDotClass,
        statusLabel: p.statusLabel,
        meta: p.meta,
        age: p.age,
        selected: p.selected,
        onSelect: () => {
          snapshotRef.current?.pins.find((x) => x.id === p.id)?.onSelect();
        },
        // Live peek via snapshotRef — same freshness trick as onSelect (qty /
        // photos can change without a signature bump).
        renderPeek: p.renderPeek
          ? (ctx) =>
              snapshotRef.current?.pins.find((x) => x.id === p.id)?.renderPeek?.(ctx)
          : undefined,
      })),
    });
  }, [setCollapseMru, signature]);

  useEffect(() => {
    if (!setCollapseMru) return;
    return () => setCollapseMru(null);
  }, [setCollapseMru]);
}

/**
 * Publish the primary scan-bar session for the parked mini scan cell; clear on
 * unmount or when `session` is null. No-op outside
 * {@link ContextPanelCollapseProvider}. Handlers ride a ref so fresh closures
 * each render do not loop the provider; `value` / placeholder / chrome
 * still re-publish when they change.
 */
export function usePublishCollapseScan(session: CollapseStripScan | null) {
  const api = useContextPanelCollapse();
  const setCollapseScan = api?.setCollapseScan;
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const value = session?.value ?? '';
  const placeholder = session?.placeholder ?? '';
  const bottomRuleClass = session?.bottomRuleClass ?? '';
  const hoverClass = session?.hoverClass ?? '';
  const theme = session?.theme ?? 'green';
  const active = session != null;

  useEffect(() => {
    if (!setCollapseScan) return;
    if (!active) {
      setCollapseScan(null);
      return;
    }
    setCollapseScan({
      value,
      placeholder,
      bottomRuleClass,
      hoverClass,
      theme,
      onChange: (next) => {
        sessionRef.current?.onChange(next);
      },
      onSubmit: () => {
        sessionRef.current?.onSubmit();
      },
    });
  }, [
    setCollapseScan,
    active,
    value,
    placeholder,
    bottomRuleClass,
    hoverClass,
    theme,
  ]);

  useEffect(() => {
    if (!setCollapseScan) return;
    return () => setCollapseScan(null);
  }, [setCollapseScan]);
}
