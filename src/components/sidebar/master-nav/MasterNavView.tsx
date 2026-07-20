'use client';

import { Fragment, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { navIconStrokeClass } from '@/components/icons/nav-weight';
import type { SidebarIconComponent, SidebarPageNav } from '@/lib/sidebar-navigation';
import { cn } from '@/utils/_cn';
import { MasterNavHeader, type MasterNavRecentModeChip } from './MasterNavHeader';
import { MasterNavDropdown } from './MasterNavDropdown';

/** Delay before the hover modes panel closes once the pointer leaves the trigger/panel. */
const HOVER_CLOSE_DELAY_MS = 120;

/** Same-page L2 mode for the hover dropdown under the header trigger. */
export interface MasterNavPageModeChip {
  id: string;
  label: string;
  icon: SidebarIconComponent;
  active: boolean;
  /** Optional group heading (admin sections). Rendered once per run. */
  group?: string;
  onSelect: () => void;
}

/**
 * Hover-opened same-page modes menu. Direct AnimatePresence child so exit
 * timing is reliable; pointer-events none on exit so a fading shell cannot
 * re-trigger open.
 */
function ModesHoverPanel({
  modes,
  className,
  onMouseEnter,
  onMouseLeave,
}: {
  modes: MasterNavPageModeChip[];
  className?: string;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}) {
  return (
    <motion.div
      key="modes-hover"
      initial={false}
      animate={{ opacity: 1, y: 0, scale: 1, pointerEvents: 'auto' as const }}
      exit={{ opacity: 0, y: -4, scale: 0.99, pointerEvents: 'none' as const }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className={cn(
        'z-dropdown max-h-[320px] overflow-y-auto rounded-2xl border border-border-soft bg-surface-card p-1 shadow-xl shadow-slate-900/10',
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
              <p className="px-2.5 pb-0.5 pt-2 text-role-micro font-bold uppercase tracking-widest text-text-muted/70">
                {mode.group}
              </p>
            )}
            <button
              type="button"
              role="menuitem"
              aria-current={mode.active ? 'page' : undefined}
              onClick={mode.onSelect}
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
}

/**
 * Presentational composite of the master nav — header trigger + a floating
 * dropdown. Fully state-driven so it wires to either local state (the
 * /design-demo showroom) or the live router (the {@link MasterNav} container).
 *
 * Two menus hang off the header **label button** (not the whole band):
 * - **Hover** — the active page's modes (fast L2 switch, no click cost).
 * - **Click** — the full nav dropdown (all pages, expandable mode lists).
 * The click menu always wins: opening it dismisses the hover panel.
 *
 * The dropdown closes on a click outside the header/menu or Escape. It floats
 * over the workspace body below (it never takes the whole panel over). The body
 * is supplied via `renderContext` (the sidebar) or omitted (the showroom card).
 * Because the menu stays within the panel's width/height, an `overflow-hidden`
 * host doesn't clip it.
 */
export function MasterNavView({
  activePage,
  activeModeId,
  open,
  onOpen,
  pageModes = [],
  recentModes = [],
  otherPages,
  expandedKey,
  onToggleRow,
  onNavigate,
  onRowHover,
  onRequestClose,
  renderContext,
  className,
}: {
  activePage: SidebarPageNav;
  activeModeId: string | null;
  open: boolean;
  onOpen: () => void;
  /** Same-page modes for the hover dropdown (modeful pages). */
  pageModes?: MasterNavPageModeChip[];
  /** Prior modes for header jump chips (excludes current; max 3). */
  recentModes?: MasterNavRecentModeChip[];
  otherPages: SidebarPageNav[];
  expandedKey: string | null;
  onToggleRow: (key: string | null) => void;
  onNavigate: (pageId: string, modeId?: string) => void;
  /** Hover hook per dropdown page row — warms the destination's data. */
  onRowHover?: (page: SidebarPageNav) => void;
  /** Dismiss the open menu (mouse leave / Escape). */
  onRequestClose?: () => void;
  /** The workspace body shown under the header; the dropdown floats over it. */
  renderContext?: () => ReactNode;
  className?: string;
}) {
  const activeMode = activePage.modes?.find((m) => m.id === activeModeId);
  const headerLabel = activeMode?.label ?? activePage.label;
  // Modes own icons — show the active mode glyph beside “now”; modeless pages stay text-only.
  const headerIcon =
    activePage.modes && activePage.modes.length > 1
      ? (activeMode ?? activePage.modes[0])?.icon
      : undefined;

  const menuRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  // ── Hover modes panel ─────────────────────────────────────────────────────
  // Hover opens only from the label button (not the whole header band). While
  // the panel is exiting, ignore re-enter so a fading hit-target cannot reopen it.
  const modeful = pageModes.length > 1;
  const [hoverOpen, setHoverOpen] = useState(false);
  const hoverCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverExitingRef = useRef(false);

  const cancelHoverClose = useCallback(() => {
    if (hoverCloseTimer.current) {
      clearTimeout(hoverCloseTimer.current);
      hoverCloseTimer.current = null;
    }
  }, []);

  /** Open from the label button — may interrupt an in-flight exit. */
  const openHoverFromTrigger = useCallback(() => {
    cancelHoverClose();
    hoverExitingRef.current = false;
    if (modeful && !open) setHoverOpen(true);
  }, [cancelHoverClose, modeful, open]);

  /**
   * Keep the panel alive while the pointer is over it. Ignored while exiting
   * (motion sets pointer-events: none), so a fading shell cannot revive itself.
   */
  const openHoverFromPanel = useCallback(() => {
    if (hoverExitingRef.current) return;
    cancelHoverClose();
    if (modeful && !open) setHoverOpen(true);
  }, [cancelHoverClose, modeful, open]);

  const scheduleHoverClose = useCallback(() => {
    cancelHoverClose();
    hoverCloseTimer.current = setTimeout(() => {
      hoverExitingRef.current = true;
      setHoverOpen(false);
    }, HOVER_CLOSE_DELAY_MS);
  }, [cancelHoverClose]);

  const handleHoverExitComplete = useCallback(() => {
    hoverExitingRef.current = false;
  }, []);

  // The click menu always wins — and clean the timer up on unmount.
  useEffect(() => {
    if (open) {
      cancelHoverClose();
      hoverExitingRef.current = false;
      setHoverOpen(false);
    }
  }, [open, cancelHoverClose]);
  useEffect(() => cancelHoverClose, [cancelHoverClose]);

  const handleToggle = useCallback(() => {
    cancelHoverClose();
    hoverExitingRef.current = false;
    setHoverOpen(false);
    if (open) onRequestClose?.();
    else onOpen();
  }, [open, onOpen, onRequestClose, cancelHoverClose]);

  // Close on Escape or a click outside the header trigger and the open menu.
  useEffect(() => {
    if (!open || !onRequestClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onRequestClose();
    };
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (headerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      onRequestClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open, onRequestClose]);

  const header = (
    <MasterNavHeader
      label={headerLabel}
      leadingIcon={headerIcon}
      open={open}
      onClick={handleToggle}
      onTriggerMouseEnter={openHoverFromTrigger}
      onTriggerMouseLeave={scheduleHoverClose}
      modesPanelOpen={hoverOpen && !open}
      recentModes={recentModes}
    />
  );

  const hoverPanel = (positionClass: string) => (
    <AnimatePresence onExitComplete={handleHoverExitComplete}>
      {hoverOpen && !open && (
        <ModesHoverPanel
          modes={pageModes}
          className={positionClass}
          onMouseEnter={openHoverFromPanel}
          onMouseLeave={scheduleHoverClose}
        />
      )}
    </AnimatePresence>
  );

  const dropdown = (
    <div className="absolute inset-x-1 top-[40px] bottom-1 z-dropdown">
      <MasterNavDropdown
        ref={menuRef}
        activePage={activePage}
        activeModeId={activeModeId}
        otherPages={otherPages}
        expandedKey={expandedKey}
        onToggleRow={onToggleRow}
        onNavigate={onNavigate}
        onRowHover={onRowHover}
        className="max-h-full"
      />
    </div>
  );

  // With a context body (the sidebar), both menus live in the header band and
  // float over the body below. Without one (the demo card), they float from
  // the header. No master-nav top hairlines — the desktop content shell owns
  // the soft radius join with the global header.
  if (renderContext) {
    return (
      <div className={cn('relative isolate flex h-full min-h-0 flex-col', className)}>
        <div ref={headerRef} className="relative z-20 shrink-0">
          {header}
        </div>
        <div className="relative z-0 min-h-0 flex-1 overflow-hidden">{renderContext()}</div>
        {hoverPanel('absolute inset-x-1 top-[40px]')}
        {/* Dropdown floats over the whole panel — anchored to the root (not the
            ~40px header band) so its definite top/bottom give the inner menu a
            height to scroll within. */}
        <AnimatePresence>{open && dropdown}</AnimatePresence>
      </div>
    );
  }

  return (
    <div className={cn('relative flex min-h-0 flex-col', className)}>
      <div className="relative z-30 shrink-0">
        <div ref={headerRef}>{header}</div>
        {hoverPanel('absolute inset-x-1 top-[calc(100%-1px)]')}
        <AnimatePresence>
          {open && (
            <div className="absolute inset-x-1 top-[calc(100%-1px)]">
              <MasterNavDropdown
                ref={menuRef}
                activePage={activePage}
                activeModeId={activeModeId}
                otherPages={otherPages}
                expandedKey={expandedKey}
                onToggleRow={onToggleRow}
                onNavigate={onNavigate}
                onRowHover={onRowHover}
              />
            </div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
