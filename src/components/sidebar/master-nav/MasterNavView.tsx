'use client';

import {
  Fragment,
  forwardRef,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { framerTransition } from '@/design-system/foundations/motion-framer';
import { useMotionTransition } from '@/design-system/foundations/motion-framer-hooks';
import { navIconStrokeClass } from '@/components/icons/nav-weight';
import type { SidebarIconComponent, SidebarPageNav } from '@/lib/sidebar-navigation';
import { cn } from '@/utils/_cn';
import { MasterNavHeader, type MasterNavRecentModeChip } from './MasterNavHeader';
import { MasterNavDropdown } from './MasterNavDropdown';

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

/**
 * Click-opened same-page modes menu. Direct AnimatePresence child so exit
 * timing is reliable.
 */
const ModesPanel = forwardRef<
  HTMLDivElement,
  {
    modes: MasterNavPageModeChip[];
    className?: string;
    /** Fired after a mode pick so the host can dismiss the panel. */
    onModeSelect?: () => void;
    /** Drop the floating card chrome — see `MasterNavDropdown`'s `flat`. */
    flat?: boolean;
  }
>(function ModesPanel({ modes, className, onModeSelect, flat = false }, ref) {
  return (
    <motion.div
      ref={ref}
      key="modes-panel"
      initial={false}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={flat ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.99 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      className={cn(
        'max-h-[320px] overflow-y-auto p-1',
        !flat && 'z-dropdown rounded-2xl border border-border-soft bg-surface-card shadow-xl shadow-slate-900/10',
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
 * Presentational composite of the master nav — header trigger + a floating
 * dropdown. Fully state-driven so it wires to either local state (the
 * /design-demo showroom) or the live router (the {@link MasterNav} container).
 *
 * Two click menus hang off the header:
 * - **Top-left chevron** — the full nav dropdown (all pages, expandable mode lists).
 * - **Right-of-label chevron** — the active page's modes (fast L2 switch).
 * Opening either dismisses the other. No hover open.
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
  layout = 'floating',
  className,
}: {
  activePage: SidebarPageNav;
  activeModeId: string | null;
  open: boolean;
  onOpen: () => void;
  /** Same-page modes for the modes dropdown (modeful pages). */
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
  /**
   * `floating` (default) — menus are absolutely positioned and float over
   * whatever is below. Used with `renderContext` (the classic sidebar panel) and
   * standalone.
   *
   * `docked` — menus render **in flow**, expanding the host downward. The
   * station column uses this: the nav card grows and pushes the recents card
   * down instead of covering it. Ignores `renderContext`.
   */
  layout?: 'floating' | 'docked';
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
  const modesPanelRef = useRef<HTMLDivElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);

  // ── Modes panel (click only) ──────────────────────────────────────────────
  const modeful = pageModes.length > 1;
  const [modesOpen, setModesOpen] = useState(false);
  // Routed through the hook so `prefers-reduced-motion` collapses the height
  // tween instead of animating layout for users who asked it not to.
  const dockedExpandTransition = useMotionTransition(framerTransition.stationCollapse);

  // Full nav always wins — dismiss modes when it opens.
  useEffect(() => {
    if (open) setModesOpen(false);
  }, [open]);

  // Dismiss modes after a mode/page jump (URL change).
  useEffect(() => {
    setModesOpen(false);
  }, [activePage.id, activeModeId]);

  const handleNavToggle = useCallback(() => {
    setModesOpen(false);
    if (open) onRequestClose?.();
    else onOpen();
  }, [open, onOpen, onRequestClose]);

  const handleModesToggle = useCallback(() => {
    if (!modeful) return;
    if (open) onRequestClose?.();
    setModesOpen((prev) => !prev);
  }, [modeful, open, onRequestClose]);

  // Close either menu on Escape or a click outside the header + open panel.
  useEffect(() => {
    if (!open && !modesOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (open) onRequestClose?.();
      setModesOpen(false);
    };
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (headerRef.current?.contains(target)) return;
      if (open && menuRef.current?.contains(target)) return;
      if (modesOpen && modesPanelRef.current?.contains(target)) return;
      if (open) onRequestClose?.();
      setModesOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [open, modesOpen, onRequestClose]);

  const header = (
    <MasterNavHeader
      label={headerLabel}
      leadingIcon={headerIcon}
      open={open}
      onClick={handleNavToggle}
      modesOpen={modesOpen && !open}
      onModesClick={handleModesToggle}
      showModesToggle={modeful}
      recentModes={recentModes}
    />
  );

  const modesPanel = (positionClass: string) => (
    <AnimatePresence>
      {modesOpen && !open && (
        <ModesPanel
          ref={modesPanelRef}
          modes={pageModes}
          className={positionClass}
          onModeSelect={() => setModesOpen(false)}
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

  // Station column: menus expand the card downward, in flow, so the recents
  // card below is pushed down rather than covered. Same shell, same width, same
  // stacking band as that card — only the anchored edge differs. `height: auto`
  // is the sanctioned layout animation for a low-frequency expand/collapse
  // (see display/motion-crossfade.md); a nav menu open is exactly that.
  if (layout === 'docked') {
    const expanded = open || modesOpen;
    return (
      <div className={cn('flex min-h-0 flex-col', className)}>
        <div ref={headerRef} className="shrink-0">
          {header}
        </div>
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              key={open ? 'nav-menu' : 'modes-menu'}
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={dockedExpandTransition}
              className="min-h-0 overflow-hidden border-t border-border-hairline"
            >
              {open ? (
                <MasterNavDropdown
                  ref={menuRef}
                  flat
                  activePage={activePage}
                  activeModeId={activeModeId}
                  otherPages={otherPages}
                  expandedKey={expandedKey}
                  onToggleRow={onToggleRow}
                  onNavigate={onNavigate}
                  onRowHover={onRowHover}
                />
              ) : (
                <ModesPanel
                  ref={modesPanelRef}
                  flat
                  modes={pageModes}
                  onModeSelect={() => setModesOpen(false)}
                />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

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
        {modesPanel('absolute inset-x-1 top-[40px]')}
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
        {modesPanel('absolute inset-x-1 top-[calc(100%-1px)]')}
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
