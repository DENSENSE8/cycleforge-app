'use client';

/**
 * Site-wide copy-chip hover bubble (full id + copy / external-link mark).
 *
 * Ops law: paint **immediately** on hover — no enter fade, no layout tween,
 * no content slide. Warehouse staff scan dense LedgerGrid columns; a 150–220ms
 * animation stack reads as "the tip is slow to load." Placement still waits one
 * measure frame (hidden until clamped) — that is geometry, not decoration.
 *
 * Close stays lightly delayed ({@link CLOSE_DELAY_MS}) so crossing chip→menu
 * gaps does not flicker the tip off.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { Check, Copy, ExternalLink } from '@/components/Icons';
import { cornerClass } from '@/design-system/tokens/radius';
import {
  clampPortalTooltipPosition,
  isTrustedPortalAnchor,
  PORTAL_TOOLTIP_MARGIN,
} from '@/lib/ui/portal-anchor';
import { cn } from '@/utils/_cn';
const CLOSE_DELAY_MS = 100;
const CARET_PAD = 10;
const MAX_PLACEMENT_RETRIES = 8;

type SiteTooltipAction = 'copy' | 'external-link';

type SiteTooltipSession = {
  anchorId: string;
  value: string;
  copied: boolean;
  action: SiteTooltipAction;
  getRect: () => DOMRect | null;
};

export type SiteTooltipContextValue = {
  activate: (args: {
    anchorId: string;
    value: string;
    getRect: () => DOMRect | null;
    action?: SiteTooltipAction;
  }) => void;
  scheduleClose: (anchorId: string) => void;
  closeNow: (anchorId: string) => void;
  syncValueIfActive: (anchorId: string, value: string) => void;
  notifyCopied: (anchorId: string) => void;
  isActiveAnchor: (anchorId: string) => boolean;
};

const SiteTooltipContext = createContext<SiteTooltipContextValue | null>(null);

export function useSiteTooltipOptional(): SiteTooltipContextValue | null {
  return useContext(SiteTooltipContext);
}

export function SiteTooltipProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SiteTooltipSession | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ top: number; left: number } | null>(null);
  const [caretOffsetX, setCaretOffsetX] = useState(0);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeAnchorIdRef = useRef<string | null>(null);
  const placementRetryRef = useRef(0);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current != null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const activate = useCallback(
    (args: {
      anchorId: string;
      value: string;
      getRect: () => DOMRect | null;
      action?: SiteTooltipAction;
    }) => {
      clearCloseTimer();
      placementRetryRef.current = 0;
      activeAnchorIdRef.current = args.anchorId;
      setTooltipPosition(null);
      setSession({
        anchorId: args.anchorId,
        value: args.value,
        copied: false,
        action: args.action ?? 'copy',
        getRect: args.getRect,
      });
    },
    [clearCloseTimer]
  );

  const scheduleClose = useCallback(
    (anchorId: string) => {
      clearCloseTimer();
      closeTimerRef.current = setTimeout(() => {
        setSession((s) => {
          if (s?.anchorId === anchorId) {
            activeAnchorIdRef.current = null;
            return null;
          }
          return s;
        });
        setTooltipPosition(null);
        closeTimerRef.current = null;
      }, CLOSE_DELAY_MS);
    },
    [clearCloseTimer]
  );

  const closeNow = useCallback(
    (anchorId: string) => {
      clearCloseTimer();
      placementRetryRef.current = 0;
      setSession((s) => {
        if (s?.anchorId === anchorId) {
          activeAnchorIdRef.current = null;
          return null;
        }
        return s;
      });
      setTooltipPosition(null);
    },
    [clearCloseTimer]
  );

  const syncValueIfActive = useCallback((anchorId: string, value: string) => {
    setSession((s) => (s?.anchorId === anchorId ? { ...s, value } : s));
  }, []);

  const notifyCopied = useCallback((anchorId: string) => {
    setSession((s) => (s?.anchorId === anchorId ? { ...s, copied: true } : s));
    window.setTimeout(() => {
      setSession((s) => (s?.anchorId === anchorId ? { ...s, copied: false } : s));
    }, 1500);
  }, []);

  const sessionRef = useRef(session);
  sessionRef.current = session;

  const isActiveAnchor = useCallback(
    (anchorId: string) => sessionRef.current?.anchorId === anchorId,
    []
  );

  const updateTooltipPosition = useCallback(() => {
    if (!session || !tooltipRef.current) return;
    const chipRect = session.getRect();
    if (!chipRect || !isTrustedPortalAnchor(chipRect)) {
      // Keep prior position cleared / hidden; retry briefly for layout settle.
      setTooltipPosition(null);
      if (placementRetryRef.current < MAX_PLACEMENT_RETRIES) {
        placementRetryRef.current += 1;
        window.requestAnimationFrame(() => updateTooltipPosition());
      }
      return;
    }

    const tooltipEl = tooltipRef.current;
    const tooltipRect = tooltipEl.getBoundingClientRect();

    const next = clampPortalTooltipPosition({
      anchor: chipRect,
      bubble: tooltipRect,
      placement: 'auto',
      margin: PORTAL_TOOLTIP_MARGIN,
    });
    if (!next) {
      setTooltipPosition(null);
      if (placementRetryRef.current < MAX_PLACEMENT_RETRIES) {
        placementRetryRef.current += 1;
        window.requestAnimationFrame(() => updateTooltipPosition());
      }
      return;
    }

    const bubbleAnchorX = chipRect.left + chipRect.width / 2;
    const caretX = Math.min(
      Math.max(bubbleAnchorX - next.left, CARET_PAD),
      tooltipRect.width - CARET_PAD,
    );

    placementRetryRef.current = 0;
    setTooltipPosition(next);
    setCaretOffsetX(caretX);
  }, [session]);

  const open = !!session;

  // Reposition on scroll / resize
  useEffect(() => {
    if (!open) return;
    const rafId = window.requestAnimationFrame(updateTooltipPosition);
    const handleReposition = () => updateTooltipPosition();
    window.addEventListener('resize', handleReposition);
    window.addEventListener('scroll', handleReposition, true);
    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleReposition);
      window.removeEventListener('scroll', handleReposition, true);
    };
  }, [open, updateTooltipPosition]);

  // Position on session change — layout effect so the tip can paint the same
  // frame the bubble mounts (no decorative enter delay after measure).
  useLayoutEffect(() => {
    if (!open) return;
    updateTooltipPosition();
    const id = window.requestAnimationFrame(() => updateTooltipPosition());
    return () => window.cancelAnimationFrame(id);
  }, [open, session, updateTooltipPosition]);

  // Reposition when tooltip resizes (value / copied-icon swap).
  useEffect(() => {
    if (!open || !tooltipRef.current) return;
    const el = tooltipRef.current;
    const ro = new ResizeObserver(() => updateTooltipPosition());
    ro.observe(el);
    return () => ro.disconnect();
  }, [open, updateTooltipPosition]);

  const api = useMemo(
    () => ({
      activate,
      scheduleClose,
      closeNow,
      syncValueIfActive,
      notifyCopied,
      isActiveAnchor,
    }),
    [activate, scheduleClose, closeNow, syncValueIfActive, notifyCopied, isActiveAnchor]
  );

  const placementReady = tooltipPosition != null;

  const portal =
    typeof document !== 'undefined'
      ? createPortal(
          open && session ? (
            <div
              ref={tooltipRef}
              style={{
                position: 'fixed',
                top: tooltipPosition?.top ?? -9999,
                left: tooltipPosition?.left ?? -9999,
                // Instant paint once clamped — no opacity fade (ops density).
                visibility: placementReady ? 'visible' : 'hidden',
              }}
              className="pointer-events-none z-tooltip"
            >
              <div
                // Match HoverTooltip chrome height: py-1 + items-center +
                // leading-none so carrier/platform id bubbles read as one line.
                // Flush-square — ops density; floating is not a soft-radius escape.
                className={cn(
                  'relative flex max-w-[min(90vw,24rem)] items-center gap-1.5 bg-surface-inverse px-2 py-1 text-role-caption font-semibold leading-none text-white shadow-md',
                  cornerClass('flush'),
                )}
              >
                <span className="font-mono whitespace-nowrap leading-none">
                  {session.value}
                </span>
                {session.action === 'external-link' ? (
                  <ExternalLink className="h-3 w-3 shrink-0 text-text-faint" aria-hidden />
                ) : session.copied ? (
                  <Check className="h-3 w-3 shrink-0 text-emerald-400" />
                ) : (
                  <Copy className="h-3 w-3 shrink-0 text-text-soft" />
                )}
                {/* Caret — static under the shell; offset updates with clamp. */}
                <span
                  className="absolute top-full border-x-4 border-b-0 border-t-4 border-x-transparent border-t-surface-inverse"
                  style={{ left: caretOffsetX, transform: 'translateX(-50%)' }}
                />
              </div>
            </div>
          ) : null,
          document.body
        )
      : null;

  return (
    <SiteTooltipContext.Provider value={api}>
      {children}
      {portal}
    </SiteTooltipContext.Provider>
  );
}
