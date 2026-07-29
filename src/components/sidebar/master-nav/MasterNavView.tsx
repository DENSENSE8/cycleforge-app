'use client';

import {
  Fragment,
  forwardRef,
  useCallback,
  useEffect,
  useState,
  useRef,
} from 'react';
import { motion } from 'framer-motion';
import { AnchoredLayer } from '@/design-system/primitives/AnchoredLayer';
import { framerPresence, framerTransition } from '@/design-system/foundations/motion-framer';
import { useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import { navIconStrokeClass } from '@/components/icons/nav-weight';
import { SCAN_FOCUS_REQUESTED_EVENT } from '@/lib/scan-hotkey/store';
import type { SidebarIconComponent, SidebarPageNav } from '@/lib/sidebar-navigation';
import { cn } from '@/utils/_cn';
import { MasterNavHeader, type MasterNavRecentModeChip } from './MasterNavHeader';
import { SidebarNavList } from './SidebarNavList';

/** Same-page L2 mode for the click dropdown under the header trigger. */
export interface MasterNavPageModeChip {
  id: string;
  label: string;
  icon: SidebarIconComponent;
  active: boolean;
  /** Optional group heading (admin sections). Rendered once per run. */
  group?: string;
  onSelect: () => void;
}

/** Click-opened same-page modes menu. Portaled by {@link AnchoredLayer}. */
const ModesPanel = forwardRef<
  HTMLDivElement,
  {
    modes: MasterNavPageModeChip[];
    className?: string;
    /** Fired after a mode pick so the host can dismiss the panel. */
    onModeSelect?: () => void;
  }
>(function ModesPanel({ modes, className, onModeSelect }, ref) {
  const transition = useMotionTransition(framerTransition.dropdownOpen);
  return (
    <motion.div
      ref={ref}
      initial={framerPresence.dropdownPanel.initial}
      animate={framerPresence.dropdownPanel.animate}
      transition={transition}
      className={cn(
        'max-h-[320px] overflow-y-auto rounded-2xl border border-border-soft bg-surface-card p-1',
        'shadow-xl shadow-slate-900/10',
        className,
      )}
      role="menu"
      aria-label="Modes"
    >
      {modes.map((mode, i) => {
        const Icon = mode.icon;
        const showGroupHeader = mode.group && mode.group !== modes[i - 1]?.group;
        return (
          <Fragment key={mode.id}>
            {showGroupHeader && (
              <p className="px-2.5 pb-0.5 pt-2 text-role-micro uppercase tracking-widest text-text-muted/70">
                {mode.group}
              </p>
            )}
            <button
              type="button"
              role="menuitem"
              aria-current={mode.active ? 'page' : undefined}
              onClick={() => {
                mode.onSelect();
                onModeSelect?.();
              }}
              className={cn(
                'ds-raw-button flex w-full items-center gap-2.5 rounded-lg inset-cozy text-left text-role-data font-medium transition-colors',
                mode.active
                  ? 'bg-blue-600 text-white'
                  : 'text-text-default hover:bg-blue-600 hover:text-white',
              )}
            >
              <Icon className={navIconStrokeClass('mode', 'h-4 w-4 shrink-0')} />
              <span className="min-w-0 flex-1 truncate">{mode.label}</span>
            </button>
          </Fragment>
        );
      })}
    </motion.div>
  );
});

/**
 * The **sidebar spine** — a 40px identity band over one swapping body.
 *
 * ## One grammar
 *
 * There used to be three ways to reach the page list, then two. Both are gone:
 *
 * - `layout="docked"` grew the nav card in flow (`height: 0 → auto`), pushing the
 *   recents rail and the scan bar down while an operator was mid-task.
 * - The `AnchoredLayer` **flyout** (`MasterNavDropdown` at `w-[28rem]`, portaled,
 *   overhanging the work canvas) replaced it on classic routes, while station
 *   routes rendered the same rows in flow as a pushed-across column — two spatial
 *   models for one control.
 *
 * Now there is one: **the page list lives in {@link SidebarSlideOver} and
 * nowhere else.** `MasterNavDropdown` is deleted; {@link SidebarNavList} is the
 * same rows with no card chrome, because the slide-over already IS the card.
 *
 * ## One body: the page list
 *
 * This renders a 40px identity band over the page list, and nothing else. A
 * route's own sidebar — the Media library's facet rail, Products' catalog
 * picker, the receiving rails — is NOT a body this component can render; it
 * mounts in the content region beside the workspace (`ContextPanelLayout`).
 *
 * That separation is the point: a route's sidebar is its own component, not a
 * state of the nav. While it was a body here, the two surfaces shared one column
 * and opening the navigator took away the picker you were navigating from.
 *
 * L2 modes stay a portaled `panelPopover` menu off the band — a short list and a
 * fast in-place switch is a different job from browsing every page, and it must
 * paint above the spine it was triggered from.
 */
export function MasterNavView({
  activePage,
  activeModeId,
  onOpen,
  pageModes = [],
  recentModes = [],
  otherPages,
  expandedKey,
  onToggleRow,
  onNavigate,
  onRowHover,
  className,
}: {
  activePage: SidebarPageNav;
  activeModeId: string | null;
  /** Open the page-list slide-over. Only wired from the resident column's band. */
  onOpen: () => void;
  /** Same-page modes for the modes dropdown (modeful pages). */
  pageModes?: MasterNavPageModeChip[];
  /** Prior modes for header jump chips (excludes current; max 3). */
  recentModes?: MasterNavRecentModeChip[];
  otherPages: SidebarPageNav[];
  expandedKey: string | null;
  onToggleRow: (key: string | null) => void;
  onNavigate: (pageId: string, modeId?: string) => void;
  /** Hover hook per page row — warms the destination's data. */
  onRowHover?: (page: SidebarPageNav) => void;
  className?: string;
}) {
  const activeMode = activePage.modes?.find((m) => m.id === activeModeId);
  const headerLabel = activeMode?.label ?? activePage.label;
  // Modes own icons — show the active mode glyph beside “now”; modeless pages stay text-only.
  const headerIcon =
    activePage.modes && activePage.modes.length > 1
      ? (activeMode ?? activePage.modes[0])?.icon
      : undefined;

  // The whole 40px band is the anchor, not either button: a click on the other
  // trigger then reads as "on the anchor" to AnchoredLayer, so it does not
  // self-dismiss and the explicit toggles below own mutual exclusion.
  const headerRef = useRef<HTMLDivElement>(null);

  const modeful = pageModes.length > 1;
  const [modesOpen, setModesOpen] = useState(false);
  const closeModes = useCallback(() => setModesOpen(false), []);

  // Dismiss modes after a mode/page jump (URL change).
  useEffect(() => {
    setModesOpen(false);
  }, [activePage.id, activeModeId]);

  // Yield to the scan bench: the focus hotkey is neither a mousedown nor Escape,
  // so AnchoredLayer cannot dismiss for it. Without this the caret would land in
  // a scan bar sitting behind an open menu.
  useEffect(() => {
    const onScanFocus = () => setModesOpen(false);
    window.addEventListener(SCAN_FOCUS_REQUESTED_EVENT, onScanFocus);
    return () => window.removeEventListener(SCAN_FOCUS_REQUESTED_EVENT, onScanFocus);
  }, []);

  const handleNavToggle = useCallback(() => {
    setModesOpen(false);
    onOpen();
  }, [onOpen]);

  const handleModesToggle = useCallback(() => {
    if (!modeful) return;
    setModesOpen((prev) => !prev);
  }, [modeful]);

  return (
    // `isolate` keeps the context panel's own sticky bands from leaking into the
    // global stack. The modes menu is portaled, so it can't trap it.
    <div className={cn('isolate flex h-full min-h-0 flex-col', className)}>
      <div ref={headerRef} className="shrink-0 border-b border-border-hairline">
        <MasterNavHeader
          label={headerLabel}
          leadingIcon={headerIcon}
          open={false}
          onClick={handleNavToggle}
          // The list IS this surface's body, so a trigger for it would be a
          // dead control. (The header's sidebar button is the way in.)
          showNavToggle={false}
          modesOpen={modesOpen}
          onModesClick={handleModesToggle}
          showModesToggle={modeful}
          recentModes={recentModes}
        />
      </div>

      {/* One body, always the page list. Nothing swaps, so no crossfade. */}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <SidebarNavList
          activePage={activePage}
          activeModeId={activeModeId}
          otherPages={otherPages}
          expandedKey={expandedKey}
          onToggleRow={onToggleRow}
          onNavigate={onNavigate}
          onRowHover={onRowHover}
        />
      </div>

      {/*
        L2 — pick a mode on the page you are already on. A short list of short
        labels and a fast in-place switch, so it stays trigger-width
        (`bottom-stretch`) and drops straight down from the band. `panelPopover`
        (120) keeps it above the spine's own `panel` (100) band.
      */}
      <AnchoredLayer
        open={modesOpen}
        onClose={closeModes}
        anchorRef={headerRef}
        placement="bottom-stretch"
        level="panelPopover"
      >
        <ModesPanel modes={pageModes} onModeSelect={closeModes} />
      </AnchoredLayer>
    </div>
  );
}
