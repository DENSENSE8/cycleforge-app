'use client';

/** Site-wide copy-chip hover bubble (full id + copy / external-link mark). */

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
import { DROPDOWN_SHELL_CORNER } from '@/design-system/tokens/radius';
import {
  clampPortalTooltipPosition,
  isTrustedPortalAnchor,
  PORTAL_TOOLTIP_MARGIN,
} from '@/lib/ui/portal-anchor';
import { cn } from '@/utils/_cn';
const CLOSE_DELAY_MS = 100;
const CARET_PAD = 10;
const MAX_PLACEMENT_RETRIES = 8;
/**
 * How long the bubble HOLDS after a copy, showing the green ✓ where the copy
 * glyph was. This is the whole confirmation: operator 2026-09-15 — *"the
 * 1500ms was too short to read — operator 2026-09-15, after the hold landed:
 */
const COPIED_HOLD_MS = 3000;

type SiteTooltipAction = 'copy' | 'external-link';

type SiteTooltipSession = {
  anchorId: string;
  value: string;
  copied: boolean;
  action: SiteTooltipAction;
  getRect: () => DOMRect | null;
};

/** One request to show the bubble on an anchor. */
type SiteTooltipActivateArgs = {
  anchorId: string;
  value: string;
  getRect: () => DOMRect | null;
  action?: SiteTooltipAction;
  /**
   * Bypass the copied hold. Only the copy path sets this: copying a SECOND id
   * while the first receipt is still up must show the second receipt, not be
   * queued behind it. A plain hover never forces.
   */
  force?: boolean;
};

type SiteTooltipContextValue = {
  activate: (args: SiteTooltipActivateArgs) => void;
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
  /** The held copy ✓: */
  const copiedAnchorRef = useRef<string | null>(null);
  const copiedValueRef = useRef<string | null>(null);
  const copiedTimerRef = useRef<number | null>(null);
  const deferredCloseRef = useRef(false);
  const pendingActivateRef = useRef<SiteTooltipActivateArgs | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current != null) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const activate = useCallback(
    (args: SiteTooltipActivateArgs) => {
      console.log('[TT] activate', args.anchorId, JSON.stringify(args.value), 'force=', !!args.force, 'hold=', copiedAnchorRef.current);
      const holder = copiedAnchorRef.current;
      const keepsMark =
        holder !== null && (holder === args.anchorId || copiedValueRef.current === args.value);

      // Someone else's hover during the receipt's window: park it, change
      // nothing. The bubble already says something the operator asked for.
      if (holder !== null && !keepsMark && !args.force) {
        pendingActivateRef.current = args;
        return;
      }

      clearCloseTimer();
      if (keepsMark) {
        copiedAnchorRef.current = args.anchorId;
      } else if (holder !== null) {
        window.clearTimeout(copiedTimerRef.current ?? undefined);
        copiedTimerRef.current = null;
        copiedAnchorRef.current = null;
        copiedValueRef.current = null;
      }
      // This anchor is live — nothing is waiting behind it.
      deferredCloseRef.current = false;
      pendingActivateRef.current = null;
      placementRetryRef.current = 0;
      activeAnchorIdRef.current = args.anchorId;
      setTooltipPosition(null);
      setSession({
        anchorId: args.anchorId,
        value: args.value,
        copied: keepsMark,
        action: args.action ?? 'copy',
        getRect: args.getRect,
      });
    },
    [clearCloseTimer],
  );

  /**
   * The real teardown. Both public close paths route through it so the copied
   * hold has exactly ONE place to intercept them.
   */
  const hardClose = useCallback(
    (anchorId: string) => {
      console.log('[TT] hardClose', anchorId);
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
    [clearCloseTimer],
  );

  const scheduleClose = useCallback(
    (anchorId: string) => {
      console.log('[TT] scheduleClose', anchorId, 'hold=', copiedAnchorRef.current);
      if (pendingActivateRef.current?.anchorId === anchorId) pendingActivateRef.current = null;
      if (copiedAnchorRef.current === anchorId) {
        deferredCloseRef.current = true;
        return;
      }
      clearCloseTimer();
      closeTimerRef.current = setTimeout(() => {
        closeTimerRef.current = null;
        hardClose(anchorId);
      }, CLOSE_DELAY_MS);
    },
    [clearCloseTimer, hardClose],
  );

  const closeNow = useCallback(
    (anchorId: string) => {
      console.log('[TT] closeNow', anchorId, 'hold=', copiedAnchorRef.current);
      // A parked hover whose anchor has since been left must not pop open when
      // the receipt ends.
      if (pendingActivateRef.current?.anchorId === anchorId) pendingActivateRef.current = null;
      if (copiedAnchorRef.current === anchorId) {
        deferredCloseRef.current = true;
        return;
      }
      hardClose(anchorId);
    },
    [hardClose],
  );

  const syncValueIfActive = useCallback((anchorId: string, value: string) => {
    setSession((s) => (s?.anchorId === anchorId ? { ...s, value } : s));
  }, []);

  const sessionRef = useRef(session);
  sessionRef.current = session;

  /** Copy landed: paint the ✓ where the copy glyph was and HOLD it for {@link COPIED_HOLD_MS}. */
  const notifyCopied = useCallback(
    (anchorId: string) => {
      console.log('[TT] notifyCopied', anchorId);
      clearCloseTimer();
      window.clearTimeout(copiedTimerRef.current ?? undefined);
      copiedAnchorRef.current = anchorId;
      deferredCloseRef.current = false;
      pendingActivateRef.current = null;
      copiedValueRef.current = sessionRef.current?.value ?? null;
      setSession((s) => (s?.anchorId === anchorId ? { ...s, copied: true } : s));
      copiedTimerRef.current = window.setTimeout(() => {
        // Read the refs, not the captured id: `activate` may have re-keyed the
        // hold onto a newer anchor for the same value.
        const holder = copiedAnchorRef.current;
        const wantsClose = deferredCloseRef.current;
        const queued = pendingActivateRef.current;
        copiedTimerRef.current = null;
        copiedAnchorRef.current = null;
        copiedValueRef.current = null;
        deferredCloseRef.current = false;
        pendingActivateRef.current = null;
        if (queued) {
          activate(queued);
          return;
        }
        if (holder == null) return;
        if (wantsClose) {
          hardClose(holder);
          return;
        }
        setSession((s) => (s?.anchorId === holder ? { ...s, copied: false } : s));
      }, COPIED_HOLD_MS);
    },
    [activate, clearCloseTimer, hardClose],
  );

  useEffect(() => () => window.clearTimeout(copiedTimerRef.current ?? undefined), []);

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
                // Match HoverTooltip chrome height:
                className={cn(
                  'relative flex max-w-[min(90vw,24rem)] items-center gap-1.5 bg-surface-inverse px-2 py-1 text-role-caption font-semibold leading-none text-white shadow-md',
                  DROPDOWN_SHELL_CORNER,
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
