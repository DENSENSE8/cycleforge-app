'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { appChromeClass } from '@/design-system/tokens/app-surface';
import {
  SIDEBAR_SPINE_PEEK_INSET_PX,
  SIDEBAR_SPINE_RESIZE,
} from '@/components/sidebar/sidebar-spine';
import { HorizontalEdgeResizeHandle } from '@/design-system/components/HorizontalEdgeResizeHandle';
import { TOP_CHROME_ROW_PX } from '@/components/layout/header-shell';
import { cornerClass } from '@/design-system/tokens/radius';
import { elevationClass } from '@/design-system/tokens/shadows';
import { zIndex } from '@/design-system/tokens/z-index';
import { motion, useAnimationControls } from '@/design-system/motion';
import { motionPresence, motionTransition } from '@/design-system/foundations/motion-presets';
import {
  useMotionPresence,
  useMotionTransition,
} from '@/design-system/foundations/motion-presets-hooks';
import {
  useHorizontalEdgeResize,
} from '@/design-system/hooks/useHorizontalEdgeResize';
import { hasOpenOverlay } from '@/lib/overlay-stack/store';
import { cn } from '@/utils/_cn';

/**
 * The host for the sidebar spine — a **resident push column**, not a layer.
 * **Two states: open, or gone (operator ruling 2026-09-05, final).** Closed is
 */
type PeekHoverHandlers = {
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
};

export function SidebarNavColumn({
  open,
  peeking = false,
  peekSurfaceProps,
  onPeekDismiss,
  onMounted,
  children,
}: {
  open: boolean;
  /** Collapsed hover thumbnail — overlay, does not push the frame. */
  peeking?: boolean;
  peekSurfaceProps?: PeekHoverHandlers & { 'data-hover-surface'?: '' };
  onPeekDismiss?: () => void;
  /** Before paint on mount — the host drops its same-width spacer in the same frame. */
  onMounted?: () => void;
  children: ReactNode;
}) {
  useLayoutEffect(() => {
    onMounted?.();
  }, [onMounted]);
  /** Mount the spine on first open — **or during the first idle window**, whichever comes first. */
  const [everOpened, setEverOpened] = useState(open);
  useEffect(() => {
    if (open || peeking) setEverOpened(true);
  }, [open, peeking]);
  useEffect(() => {
    if (everOpened) return;
    const ric = (window as typeof window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    }).requestIdleCallback;
    if (ric) {
      const id = ric(() => setEverOpened(true), { timeout: 3_000 });
      return () => window.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(() => setEverOpened(true), 1_500);
    return () => window.clearTimeout(t);
  }, [everOpened]);

  // Same splitter grammar as the context rail, with ONE deliberate difference:
  const { width, edgeHandleProps, isDragging, collapseArmed } = useHorizontalEdgeResize({
    storageKey: SIDEBAR_SPINE_RESIZE.storageKey,
    defaultWidth: SIDEBAR_SPINE_RESIZE.defaultWidthPx,
    minWidth: SIDEBAR_SPINE_RESIZE.minWidthPx,
    maxWidth: SIDEBAR_SPINE_RESIZE.maxWidthPx,
    edge: 'trailing',
    label: 'Resize sidebar',
    testId: 'sidebar-spine-resize',
  });

  const peekOverlay = peeking && !open;
  const navVisible = open || peeking;

  const peekPresence = useMotionPresence(motionPresence.navPeekCorner);
  const peekTransition = useMotionTransition(motionTransition.navPeekCorner);
  const peekControls = useAnimationControls();
  const [peekFace, setPeekFace] = useState(peekOverlay);
  const peekOverlayRef = useRef(peekOverlay);
  peekOverlayRef.current = peekOverlay;
  const peekPresenceRef = useRef(peekPresence);
  peekPresenceRef.current = peekPresence;
  const peekTransitionRef = useRef(peekTransition);
  peekTransitionRef.current = peekTransition;

  useLayoutEffect(() => {
    if (peekOverlay) setPeekFace(true);
  }, [peekOverlay]);

  useLayoutEffect(() => {
    if (!peekFace) return undefined;
    const presence = peekPresenceRef.current;
    const transition = peekTransitionRef.current;
    if (open) {
      void peekControls.set({ opacity: 1, scale: 1 });
      setPeekFace(false);
      return undefined;
    }
    if (peekOverlay) {
      void peekControls.set(presence.initial);
      void peekControls.start({
        ...presence.animate,
        transition,
      });
      return undefined;
    }
    let cancelled = false;
    void peekControls
      .start({
        ...(presence.exit ?? presence.initial),
        transition,
      })
      .then(() => {
        if (!cancelled && !peekOverlayRef.current) setPeekFace(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, peekFace, peekOverlay, peekControls]);

  const peekLayout = peekFace && !open;

  useEffect(() => {
    if (!peekOverlay || !onPeekDismiss) return undefined;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      // Anything stacked above the peek (a dialog, a route overlay) owns
      // Escape first — the peek is the bottom of the stack, not a peer.
      if (hasOpenOverlay()) return;
      onPeekDismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [peekOverlay, onPeekDismiss]);

  return (
    <div
      data-sidebar-nav-column
      data-open={open ? 'true' : 'false'}
      data-peeking={peekOverlay ? 'true' : 'false'}
      // Width snaps open ↔ closed.
      className="relative h-full shrink-0 overflow-visible"
      style={{ width: open ? width : 0 }}
    >
      {everOpened && (
        <motion.aside
          // NOT `role="dialog" aria-modal` — it installs no focus trap and
          // blocks nothing. What it is, in the only state it has, is the
          // navigator.
          role="navigation"
          aria-label="Sidebar"
          data-testid={peekLayout ? 'sidebar-spine-peek' : undefined}
          data-spine-peek={peekLayout ? 'true' : undefined}
          // The spine stays mounted once opened, so a closed column would otherwise leave every nav row in the tab order with nothing on screen.
          inert={!navVisible && !peekFace}
          initial={false}
          animate={peekControls}
          {...(peekLayout ? peekSurfaceProps : undefined)}
          className={cn(
            'flex flex-col overflow-hidden',
            peekLayout
              ? cn(
                  'h-auto origin-top-left border border-border-soft bg-surface-card',
                  cornerClass('surface'),
                  // Flat when shown — overlay ambient (`0 0 4px`) is the glow
                  // around the open/peek spine. Border carries the card edge.
                  elevationClass('flat'),
                  // The head's toggle + Search row is CHROME, not map.
                  '[&_[data-spine-head-chrome]]:hidden',
                  '[&_[data-spine-nav]]:h-auto [&_[data-spine-nav]]:min-h-0',
                  // The card hugs short lists (`h-auto` shell) but is capped by maxHeight below — so the scrollport must be able to SHRINK, or a full…
                  '[&_[data-spine-scrollport]]:min-h-0 [&_[data-spine-scrollport]]:flex-1 [&_[data-spine-scrollport]]:overflow-y-auto [&_[data-spine-scrollport]]:overscroll-contain',
                  '[&_[data-spine-drill-pad]]:pb-0',
                )
              : cn(
                  'absolute inset-y-0 left-0',
                  // The seam belongs to an OPEN column.
                  open ? 'border-r border-border-soft' : null,
                  // The navigator is CHROME, not a work canvas (app-surface SoT:
                  appChromeClass,
                ),
          )}
          style={
            peekLayout
              ? {
                  position: 'fixed',
                  top: TOP_CHROME_ROW_PX + SIDEBAR_SPINE_PEEK_INSET_PX,
                  left: SIDEBAR_SPINE_PEEK_INSET_PX,
                  width,
                  maxHeight: `calc(100dvh - ${TOP_CHROME_ROW_PX + SIDEBAR_SPINE_PEEK_INSET_PX * 2}px)`,
                  zIndex: zIndex.navPeek,
                  transformOrigin: '0 0',
                }
              : { width: open ? width : 0, transformOrigin: '0 0' }
          }
        >
          <div className="flex min-h-0 flex-1 flex-col">{children}</div>
        </motion.aside>
      )}
      {open ? (
        // Trailing-edge sash — identical grammar to the context rail's own handle (`ContextPanelLayout`):
        <HorizontalEdgeResizeHandle
          edgeHandleProps={edgeHandleProps}
          isDragging={isDragging}
          edge="trailing"
          placement="inset"
          armed={collapseArmed}
          tooltipLabel="Resize sidebar"
        />
      ) : null}
    </div>
  );
}
